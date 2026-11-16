package io.m9sweeper.trawler.scanners;


import com.amazonaws.auth.AWSCredentials;
import com.amazonaws.auth.AWSStaticCredentialsProvider;
import com.amazonaws.auth.BasicAWSCredentials;
import com.amazonaws.services.ecr.AmazonECR;
import com.amazonaws.services.ecr.AmazonECRClientBuilder;
import com.amazonaws.services.ecr.model.GetAuthorizationTokenRequest;
import com.amazonaws.services.ecr.model.GetAuthorizationTokenResult;
import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import io.m9sweeper.trawler.TrawlerConfiguration;
import io.m9sweeper.trawler.framework.docker.DockerRegistry;
import io.m9sweeper.trawler.framework.scans.*;
import org.apache.commons.text.StringEscapeUtils;

import java.io.*;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.util.Collections;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class Trivy implements Scanner {

    private static final Pattern PRIVATE_ECR_HOST = Pattern.compile(
            "^([0-9]{12})\\\\.dkr\\\\.ecr(?:-fips)?\\\\.([a-z0-9-]+)\\\\.amazonaws\\\\.com(?:\\\\.cn)?$");

    public static boolean isPrivateEcrHost(String hostname) {
        return hostname != null && PRIVATE_ECR_HOST.matcher(hostname).matches();
    }

    public static String privateEcrRegion(String hostname) {
        Matcher match = PRIVATE_ECR_HOST.matcher(hostname == null ? "" : hostname);
        if (!match.matches()) throw new IllegalArgumentException("Not an Amazon ECR registry hostname");
        return match.group(2);
    }

    private ScanConfig config;
    private String rawResults;
    private String imageHash;
    ArrayList<ScanResultIssue> allIssues;

    /**
     * Initializes the Scanner. This is a required Scanner method
     * and is should be used to initialize the configuration for the plugin and any
     * plugin specific things. This acts as the constructor for the scanner.
     *
     * @param scanConfig the ScanConfig that defines the plugin settings and scan information
     * @see ScanConfig
     * @see Scanner
     */
    @Override
    public void initScanner(ScanConfig scanConfig) {
        this.config = scanConfig;
    }

    /**
     * Prepares the host system and plugin for running a scan.
     * Anything that needs to be done prior to a scan being run
     * should be placed in here.
     */
    @Override
    public void prepSystem() {
        this.rawResults = "";
        this.allIssues = new ArrayList<>(0);
        this.imageHash = "";
    }

    /**
     * Runs the scan as defined by the ScanConfig passed into the scanner
     * in the {@link #initScanner(ScanConfig)} method. This should start the scan,
     * and wait for it to complete. Raw scan results should be saved so they can be executed
     * in the next stage, {@link #parseResults()}.
     */
    @Override
    public void runScan() throws Exception {
        System.out.println("Initiating remote Trivy scan of " + config.getImage().buildFullPath(true, false) +
                " for " + config.getPolicy().getName() + ":" + config.getScannerName());
        StringBuilder trivyScanCommandBuilder = new StringBuilder();

        // Private ECR needs a short-lived registry token even when the registry
        // record was discovered automatically and has no explicit authType.
        // Prefer the Pod's AWS workload identity (IRSA/Pod Identity) rather than
        // storing permanent access keys in registry settings.
        DockerRegistry registry = config.getImage().getRegistry();
        Map<String, String> scanEnvironment = new HashMap<>();
        if (isPrivateEcrHost(registry.getHostname()) || "ACR".equals(registry.getAuthType())) {
            if (!isPrivateEcrHost(registry.getHostname())) {
                throw new IllegalArgumentException("Amazon ECR authentication requires a valid private ECR hostname");
            }
            Matcher hostMatch = PRIVATE_ECR_HOST.matcher(registry.getHostname());
            hostMatch.matches();
            String accountId = hostMatch.group(1);
            String region = hostMatch.group(2);
            Map<?, ?> details = registry.getAuthDetails() instanceof Map
                    ? (Map<?, ?>) registry.getAuthDetails() : Collections.emptyMap();
            String accessKey = String.valueOf(details.getOrDefault("acrAccessKey", ""));
            String secretKey = String.valueOf(details.getOrDefault("acrSecretKey", ""));
            AmazonECRClientBuilder clientBuilder = AmazonECRClientBuilder.standard().withRegion(region);
            if (!accessKey.isEmpty() && !secretKey.isEmpty()) {
                AWSCredentials staticCredentials = new BasicAWSCredentials(accessKey, secretKey);
                clientBuilder.withCredentials(new AWSStaticCredentialsProvider(staticCredentials));
            }
            AmazonECR ecr = clientBuilder.build();
            try {
                GetAuthorizationTokenResult tokenResult = ecr.getAuthorizationToken(
                        new GetAuthorizationTokenRequest().withRegistryIds(accountId));
                if (tokenResult.getAuthorizationData() == null ||
                        tokenResult.getAuthorizationData().isEmpty()) {
                    throw new IllegalStateException("ECR returned no registry authorization token");
                }
                String decodedToken = new String(Base64.getDecoder().decode(
                        tokenResult.getAuthorizationData().get(0).getAuthorizationToken()),
                        java.nio.charset.StandardCharsets.UTF_8);
                if (!decodedToken.startsWith("AWS:") || decodedToken.length() <= 4) {
                    throw new IllegalStateException("ECR returned an invalid registry authorization token");
                }
                scanEnvironment.put("TRIVY_USERNAME", "AWS");
                scanEnvironment.put("TRIVY_PASSWORD", decodedToken.substring(4));
            } catch (Exception e) {
                // Do not print the AWS token, credentials, or entire HTTP request.
                throw new IllegalStateException(
                        "Unable to authenticate to private ECR registry " + registry.getHostname() +
                        ". Grant the Trawler pod IAM ecr:GetAuthorizationToken and ECR image pull permissions using IRSA/Pod Identity.",
                        e);
            } finally {
                ecr.shutdown();
            }
        } else if ("GCR".equals(registry.getAuthType())) {
            // Create a temporary auth file for Trivy to use for authentication with GCR
            File gcrAuthFile = File.createTempFile("gcrAuthFile-", ".json");

            // Fetch the authentication details from the registry details
            Map<String, Object> authDetails = (Map<String, Object>) registry.getAuthDetails();

            // Write the auth JSON to the temp JSON file
            try (FileWriter writer = new FileWriter(gcrAuthFile)) {
                writer.write(authDetails.getOrDefault("gcrAuthJson", "").toString());
            } catch (IOException e) {
                e.printStackTrace();
            }

            // Ensure that the file is deleted upon exiting so that we do not leave credentials lying around.
            gcrAuthFile.deleteOnExit();

            // Export the location of this file so that Trivy can utilize it
            trivyScanCommandBuilder.append("export GOOGLE_APPLICATION_CREDENTIALS=").append(gcrAuthFile.getAbsolutePath()).append("; ");
        } else if ("AZCR".equals(registry.getAuthType())) {
            // Azure Container Registry images are accessed with a service principal set up beforehand. Trawler only needs to
            // export the Client ID, Secret, and Tenant ID of the service principal to allow Trivy to connect to it
            Map<String, Object> authDetails = (Map<String, Object>) registry.getAuthDetails();

            String clientId = authDetails.getOrDefault("azureClientId", "").toString();
            String clientSecret = authDetails.getOrDefault("azureClientSecret", "").toString();
            String tenantId = authDetails.getOrDefault("azureTenantId", "").toString();

            trivyScanCommandBuilder.append("export AZURE_CLIENT_ID=").append(escapeXsi(clientId)).append("; ");
            trivyScanCommandBuilder.append("export AZURE_CLIENT_SECRET=").append(escapeXsi(clientSecret)).append("; ");
            trivyScanCommandBuilder.append("export AZURE_TENANT_ID=").append(escapeXsi(tenantId)).append("; ");
        } else if (registry.getIsLoginRequired()) {
            trivyScanCommandBuilder.append("export TRIVY_USERNAME=").append(escapeXsi(registry.getUsername())).append("; ");
            trivyScanCommandBuilder.append("export TRIVY_PASSWORD=").append(escapeXsi(registry.getPassword())).append("; ");
        }

        // Do not clear the Trivy vulnerability database cache for every image.
        // That adds a separate blocking process and can contend with active scans.
        // The Trivy client maintains and refreshes its cache automatically.
        
        // run trivy scan
        // Kubernetes image IDs often contain a container config digest, which is
        // NOT a registry manifest digest. Appending that value as @sha256
        // produces MANIFEST_UNKNOWN even when the tagged image is valid.
        // Scan the remote registry tag; Trivy's result supplies the resolved
        // artifact identity, rather than guessing the manifest digest.
        trivyScanCommandBuilder.append("trivy -q image --image-src remote --timeout 30m --scanners vuln -f json '");
        trivyScanCommandBuilder.append(escapeXsi(
                config.getImage().buildFullPath(true, false)
        ));
        trivyScanCommandBuilder.append("'");

        // Each scan uses a short-lived shell process. Credentials exported there
        // disappear with that process; appended "unset" commands are unnecessary
        // and could mask the Trivy exit status.

        if (TrawlerConfiguration.getInstance().getDebug()) {
            // The shell command may contain private registry credentials.
            System.out.println("Invoking Trivy image vulnerability scanner (arguments redacted)");
        }

        ProcessBuilder processBuilder = new ProcessBuilder();
        processBuilder.command("bash", "-c", trivyScanCommandBuilder.toString());
        processBuilder.environment().putAll(scanEnvironment);
        processBuilder.redirectErrorStream(true);

        Process process = processBuilder.start();
        System.out.println("Remote Trivy process launched; awaiting scan results");

        StringBuilder output = new StringBuilder();
        StringBuilder errorOutput = new StringBuilder();
        StringBuilder jsonScanResultOutput = new StringBuilder();

        BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getInputStream()));

//        BufferedReader readerErr = new BufferedReader(
//                new InputStreamReader(process.getErrorStream()));

        boolean isJsonOutputStarted = false;

        String line;
        if (TrawlerConfiguration.getInstance().getDebug()) {
            System.out.println("RAW TRIVY STDOUT:");
        }

        while ((line = reader.readLine()) != null) {
            if (TrawlerConfiguration.getInstance().getDebug()) {
                System.out.println(line);
            }

            output.append(line + "\n");

            if (line.startsWith("{") && jsonScanResultOutput.length() == 0) {
                isJsonOutputStarted = true;
            }

            if (isJsonOutputStarted) {
                jsonScanResultOutput.append(line);
            }

            if (line.startsWith("}") && line.length() == 1 && jsonScanResultOutput.length() > 0) {
                isJsonOutputStarted = false;
            }

            if (!line.isEmpty()) {
                if (line.contains("FATAL") || errorOutput.length() > 0) {
                    errorOutput.append(line + "\n");
                }
            }
        }
        String errorMessage = errorOutput.toString().trim();
        if (TrawlerConfiguration.getInstance().getDebug() && errorMessage.length() > 0) {
            System.err.println("ERROR: " + errorMessage);
        }

        int exitVal = process.waitFor();
        System.out.println("Remote Trivy process completed with exit code " + exitVal);
        if (exitVal == 0) {
            if (errorMessage.length() > 0) {
                throw new Exception(errorMessage);
            } else {
                rawResults = jsonScanResultOutput.toString();
            }
        } else {
            throw new Exception(errorMessage.isEmpty() ?
                    "Trivy process failed with exit code " + exitVal + " (no JSON report)" : errorMessage);
        }
    }

    private String escapeXsi(String authToken) {
        return StringEscapeUtils.escapeXSI(authToken);
    }

    /**
     * This runs after the scan has been completed. Logic that will parse the results and store them in
     * the ScanResult object so the result can get reported back to m9sweeper or output to the console
     * if running in the standalone mode.
     */
    @Override
    public void parseResults() {

        Gson parser = new Gson();
        JsonObject imageScanObject;
        try {
            imageScanObject = parser.fromJson(rawResults, JsonObject.class);
        } catch (com.google.gson.JsonParseException e) {
            throw new IllegalStateException("Trivy did not produce a valid JSON report; refusing to treat this image as compliant.", e);
        }
        if (imageScanObject == null) {
            throw new IllegalStateException("Trivy did not produce a valid JSON report; refusing to treat this image as compliant.");
        }
        if (TrawlerConfiguration.getInstance().getDebug()) {
            System.out.println("Parsed a Trivy JSON report");
        }

        if (imageScanObject.get("Metadata") != null && !imageScanObject.get("Metadata").isJsonNull()) {
            JsonObject imageScanMetadata = imageScanObject.getAsJsonObject("Metadata");
            if (imageScanMetadata.get("RepoDigests") != null && !imageScanMetadata.get("RepoDigests").isJsonNull()) {
                JsonArray repoDigests = imageScanMetadata.getAsJsonArray("RepoDigests");
                if (repoDigests.size() > 0) {
                    String digest = repoDigests.get(0).getAsString();
                    if (digest.contains("sha256:")) {
                        this.imageHash = digest.substring(digest.indexOf("sha256:") + "sha256:".length());
                    }
                }
            }
        }

        if (imageScanObject.get("Results") != null && !imageScanObject.get("Results").isJsonNull()) {
            JsonArray imageScanResults = imageScanObject.getAsJsonArray("Results");
            if (TrawlerConfiguration.getInstance().getDebug())
                System.out.println("Image scan result size: " + imageScanResults.size());
            if (imageScanResults != null && imageScanResults.size() > 0) {
                for (int i = 0; i < imageScanResults.size(); i++) {
                    JsonObject imageScanResult = (JsonObject) imageScanResults.get(i);
                    if (imageScanResult.get("Vulnerabilities") != null && !imageScanResult.get("Vulnerabilities").isJsonNull()) {
                        JsonArray vulnerabilities = imageScanResult.getAsJsonArray("Vulnerabilities");
                        if (vulnerabilities != null && vulnerabilities.size() > 0) {
                            if (TrawlerConfiguration.getInstance().getDebug())
                                System.out.println("Total vulnerabilities found: " + vulnerabilities.size());
                            vulnerabilities.forEach(vulnerability -> {
                                JsonObject v = vulnerability.getAsJsonObject();
                                String severityText = v.has("Severity") && !v.get("Severity").isJsonNull()
                                        ? v.get("Severity").getAsString() : "UNKNOWN";
                                IssueSeverity severity;
                                try {
                                    severity = IssueSeverity.valueOf(severityText.toUpperCase(java.util.Locale.ROOT));
                                } catch (IllegalArgumentException e) {
                                    severity = IssueSeverity.UNKNOWN;
                                }
                                boolean isHighSeverity = severity == IssueSeverity.CRITICAL || severity == IssueSeverity.HIGH;
                                ScanResultIssue issue = new ScanResultIssueBuilder(config.getScanId(), config.getScannerName())
                                        .withName(v.get("Title") == null ? "" : v.get("Title").getAsString())
                                        .withDescription(v.get("Description") == null ? "" : v.get("Description").getAsString())
                                        .withSeverity(severity)
                                        .withIsCompliant(!isHighSeverity && severity != IssueSeverity.UNKNOWN) // Unknown severity needs manual review
                                        .withType(v.get("VulnerabilityID") == null ? "" : v.get("VulnerabilityID").getAsString())
                                        .withIsFixable(!(v.get("FixedVersion") == null ? "" : v.get("FixedVersion").getAsString()).isEmpty())
                                        .withVulnerabilityDescUrl(v.get("PrimaryURL") == null ? "" : v.get("PrimaryURL").getAsString())
                                        .withExtraData(v.toString())
                                        .build();

                                // only valid issues
                                // Unknown severities must not disappear from reports.
                                allIssues.add(issue);
                            });
                        }
                    }
                }
            }
        }
    }

    @Override
    public List<ScanResultIssue> getScanResult() {
        return allIssues;
    }

    public String getImageHash() { return imageHash; }

    /**
     * Cleans up the host system and any plugin specific items. This is run after the
     * method and should be used to remove any containers, images,
     * networks, or other resources created while running the scan.
     */
    @Override
    public void cleanup() {

    }
}
