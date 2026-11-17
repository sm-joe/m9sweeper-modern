package io.m9sweeper.trawler;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rabbitmq.client.Channel;
import com.rabbitmq.client.AMQP;
import com.rabbitmq.client.Connection;
import com.rabbitmq.client.ConnectionFactory;
import io.m9sweeper.trawler.commands.AbstractCommand;
import io.m9sweeper.trawler.commands.ScanCommand;
import io.m9sweeper.trawler.framework.TrawlerRunMode;
import io.m9sweeper.trawler.framework.client.api.M9SweeperApi;
import io.m9sweeper.trawler.framework.client.handler.ApiClient;
import io.m9sweeper.trawler.framework.client.handler.Configuration;
import io.m9sweeper.trawler.framework.client.handler.auth.ApiKeyAuth;
import io.m9sweeper.trawler.framework.client.model.DockerRegistriesDto;
import io.m9sweeper.trawler.framework.client.model.DockerRegistriesResponseDto;
import io.m9sweeper.trawler.framework.client.model.PoliciesByClusterResponse;
import io.m9sweeper.trawler.framework.queue.Message;
import io.m9sweeper.trawler.framework.queue.Registry;
import io.m9sweeper.trawler.scanners.Trivy;
import picocli.CommandLine;

import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.io.OutputStream;
import io.m9sweeper.trawler.framework.exception.NoncompliantException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeoutException;

@CommandLine.Command(name = "trawler", description = "Run Trawler in its RabbitMQ mode where it will monitor " +
        "a specified RabbitMQ queue for scan jobs.", subcommands = ScanCommand.class)
public class Trawler extends AbstractCommand implements Runnable {

    @CommandLine.Option(names = {"-u", "--rabbitmq-user"}, description = "username of the RabbitMQ server", order = 3)
    String rabbitmqUsername;

    @CommandLine.Option(names = {"-p", "--rabbitmq-password"}, description = "password of the RabbitMQ server", order = 4)
    String rabbitmqPassword;

    @CommandLine.Option(names = {"-H", "--rabbitmq-host"}, description = "hostname of the RabbitMQ server", order = 5)
    String rabbitmqHostname;

    @CommandLine.Option(names = {"-t", "--rabbitmq-port"}, description = "port of the RabbitMQ server", order = 6)
    int rabbitmqPort;

    @CommandLine.Option(names = {"-q", "--rabbitmq-queue"}, description = "name of the RabbitMQ queue to listen on", order = 7)
    String rabbitmqQueueName;

    /**
     * Run the main application for Trawler. This runs the default command, the basic trawler command which will start
     * the application in the rabbitmq mode.
     * @param args Application arguments from the CLI command launching trawler
     */
    public static void main(String[] args) {
        // Create an instance of the TrawlerConfiguration to ensure it fetches any
        // environment variables that have been set already in the .env file.
        TrawlerConfiguration.getInstance();

        // Launch the trawler command or its subcommands
        int exitCode = new CommandLine(new Trawler()).execute(args);
        if (exitCode != 0) {
            System.exit(exitCode);
        }
    }

    /**
     * Update the configuration based on variables that were passed into the application as CLI options
     */
    public void updateConfig() {
        // If the m9sweeper URL was defined, override what is declared in env vars
        if (m9sweeperUrl != null) {
            TrawlerConfiguration.getInstance().setM9sweeperUrl(m9sweeperUrl);
        }

        // If the m9sweeperApiKey was defined, override what is declared in the env vars
        if (m9sweeperApiKey != null) {
            TrawlerConfiguration.getInstance().setM9sweeperApiKey(m9sweeperApiKey);
        }

        // If the rabbitmqUsername was defined, override what is declared in the env vars
        if (rabbitmqUsername != null) {
            TrawlerConfiguration.getInstance().setRabbitmqUsername(rabbitmqUsername);
        }

        // If the rabbitmqPassword was defined, override what is declared in the env vars
        if (rabbitmqPassword != null) {
            TrawlerConfiguration.getInstance().setRabbitmqPassword(rabbitmqPassword);
        }

        // If the rabbitmqHostname was defined, override what is declared in the env vars
        if (rabbitmqHostname != null) {
            TrawlerConfiguration.getInstance().setRabbitmqHostname(rabbitmqHostname);
        }

        // Update the rabbitmqPort if the number provided by CLI is different than that of the env var
        if (rabbitmqPort != 0) {
            TrawlerConfiguration.getInstance().setRabbitmqPort(rabbitmqPort);
        }

        // If the rabbitmqQueueName was defined, override what is declared in the env vars
        if (rabbitmqQueueName != null) {
            TrawlerConfiguration.getInstance().setRabbitmqQueueName(rabbitmqQueueName);
        }
    }

    static final int MAX_SCAN_DELIVERY_RETRIES = 3;

    static String canonicalPrivateEcrHost(Message payload) {
        if (payload == null || payload.getImage() == null || payload.getRegistry() == null) return null;
        String imageHost = payload.getImage().getUrl();
        String registryHost = payload.getRegistry().getHostname();
        if (Trivy.isPrivateEcrHost(imageHost)) return imageHost;
        if (Trivy.isPrivateEcrHost(registryHost) &&
                (imageHost == null || imageHost.isBlank() || imageHost.equals(registryHost))) {
            return registryHost;
        }
        return null;
    }

    static boolean canScanUnconfiguredRegistry(String hostname) {
        return Trivy.isPrivateEcrHost(hostname);
    }

    static int retryCount(Map<String, Object> headers) {
        if (headers == null) return 0;
        Object count = headers.get("x-m9sweeper-retries");
        if (count instanceof Number) return Math.max(0, ((Number) count).intValue());
        return 0;
    }

    /**
     * Report final scan failure to Dash after durable quarantine publication.
     * If unavailable, the quarantine message remains durable and the backend
     * timeout reconciler will eventually mark the run failed.
     */
    private static void notifyQuarantinedScan(byte[] bytes) {
        try {
            // Extract mandatory correlation fields directly from the original
            // broker JSON: unknown or incomplete POJOs must never silently
            // skip the terminal scan-ledger callback.
            com.fasterxml.jackson.databind.JsonNode job = new ObjectMapper().readTree(bytes);
            String raw = job.path("scanRunId").asText("");
            long clusterId = job.path("cluster").path("id").asLong(0);
            long imageId = job.path("image").path("id").asLong(0);
            if (!raw.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}") ||
                    clusterId <= 0 || imageId <= 0) {
                System.err.println("Quarantined job missing valid scan correlation; durable evidence retained");
                return;
            }
            String root = TrawlerConfiguration.getInstance().m9sweeperUrl().replaceAll("/+$", "");
            String url = root + "/api/clusters/" + clusterId +
                    "/images/" + imageId + "/trawler/scan/fail";
            HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
            try {
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(5000);
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                // LoggedInUserFactory resolves X-API-Key (not the legacy
                // Swagger security name x-auth-token). The old header made
                // quarantine callbacks fail authentication while the DLQ
                // still filled, leaving image_scan_runs falsely queued.
                conn.setRequestProperty("x-api-key", TrawlerConfiguration.getInstance().m9sweeperApiKey());
                conn.setDoOutput(true);
                String json = new ObjectMapper().writeValueAsString(
                        java.util.Collections.singletonMap("scanRunId", raw));
                try (OutputStream out = conn.getOutputStream()) {
                    out.write(json.getBytes(StandardCharsets.UTF_8));
                }
                int status = conn.getResponseCode();
                if (status >= 200 && status < 300) {
                    System.out.println("PASS: quarantine scan-ledger callback acknowledged by Dash");
                } else {
                    // Never log the key, URL query or payload; status is sufficient.
                    System.err.println("Dash did not acknowledge scan quarantine; HTTP " +
                            status + "; timed reconciliation remains active");
                }
            } finally {
                conn.disconnect();
            }
        } catch (Exception error) {
            System.err.println("Quarantined job retained; Dash failure callback unavailable");
        }
    }

    Connection getAmpqConnection(ConnectionFactory factory, int retry) throws InterruptedException {
        final int maxAttempts = retry + 1;
        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                Connection connection = factory.newConnection();
                if (attempt > 1) {
                    System.out.println("RabbitMQ connection established after " + attempt +
                            " startup attempts; Trawler recovered from broker startup delay");
                } else {
                    System.out.println("RabbitMQ connection established");
                }
                return connection;
            } catch (IOException | TimeoutException e) {
                if (attempt == maxAttempts) {
                    throw new IllegalStateException("Trawler cannot connect to RabbitMQ after " +
                            attempt + " startup attempts (" + e.getClass().getSimpleName() + ")", e);
                }
                if (attempt == 1) {
                    System.out.println("RabbitMQ not ready yet; retrying startup connection (up to " +
                            maxAttempts + " attempts)");
                }
                Thread.sleep(factory.getNetworkRecoveryInterval());
            }
        }
        throw new IllegalStateException("Unexpected RabbitMQ connection retry exhaustion");
    }

    /**
     * If this command is called, run trawler as a background service listening to the RabbitMQ server
     */
    @Override
    public void run() {
        updateConfig();
        TrawlerConfiguration.getInstance().setTrawlerRunMode(TrawlerRunMode.RABBITMQ);
        TrawlerConfiguration.getInstance().verifyConfig();

        // Configure the API client
        ApiClient defaultClient = Configuration.getDefaultApiClient();
        defaultClient.setBasePath(TrawlerConfiguration.getInstance().m9sweeperUrl());
        ApiKeyAuth xAuthToken = (ApiKeyAuth) defaultClient.getAuthentication("x-auth-token");
        xAuthToken.setApiKey(TrawlerConfiguration.getInstance().m9sweeperApiKey());
        M9SweeperApi api = new M9SweeperApi(defaultClient);

        // Configure the RabbitMQ Connection
        ConnectionFactory factory = new ConnectionFactory();
        factory.setHost(TrawlerConfiguration.getInstance().rabbitmqHostname());
        factory.setPort(TrawlerConfiguration.getInstance().rabbitmqPort());
        factory.setUsername(TrawlerConfiguration.getInstance().rabbitmqUsername());
        factory.setPassword(TrawlerConfiguration.getInstance().rabbitmqPassword());
        factory.setAutomaticRecoveryEnabled(true);
        factory.setTopologyRecoveryEnabled(true); 
        factory.setConnectionTimeout(5000);
        factory.setNetworkRecoveryInterval(5000);

        try {
            // Create the connection and connection channel to RabbitMQ
            Connection connection = getAmpqConnection(factory, 10);

            Channel channel = connection.createChannel();

            // Select the right RabbitMQ Queue to monitor
            String scanQueue = TrawlerConfiguration.getInstance().rabbitmqQueueName();
            String failedQueue = scanQueue + ".failed";
            channel.queueDeclare(scanQueue, true, false, false, null);
            // Quarantine permanently failing jobs without dropping the evidence.
            channel.queueDeclare(failedQueue, true, false, false, null);
            channel.confirmSelect();

            // Display a message stating that Trawler is listening for messages
            System.out.println("Trawler is waiting for scan jobs...");

            // Consume a message from the queue and execute the scan accordingly
            // Consumer ack happens only after Dash has accepted and persisted the scan result.
            channel.basicQos(1);
            channel.basicConsume(TrawlerConfiguration.getInstance().rabbitmqQueueName(), false, (consumerTag, delivery) -> {
                String scanStage = "decode";
                try {
                    ObjectMapper mapper = new ObjectMapper();

                    // Get the contents of the message
                    String message = new String(delivery.getBody(), StandardCharsets.UTF_8);
                    Message payload = mapper.readValue(message, Message.class);
                    if (payload == null || payload.getCluster() == null ||
                            payload.getCluster().getId() == null || payload.getImage() == null ||
                            payload.getImage().getId() == null || payload.getRegistry() == null) {
                        throw new IOException("Invalid queued image scan payload");
                    }
                    Object jobRunId = payload.getAdditionalProperties().get("scanRunId");
                    System.out.println("Received image scan job for cluster " +
                            payload.getCluster().getId() + ", image " +
                            payload.getImage().getId() + ", run " +
                            (jobRunId instanceof String ? jobRunId : "legacy"));

                    scanStage = "registry resolution";
                    String ecrHost = canonicalPrivateEcrHost(payload);
                    if (ecrHost != null) {
                        // Private ECR auth uses workload identity; the registry
                        // config endpoint is optional and must not block scans.
                        payload.getRegistry().setHostname(ecrHost);
                        payload.getRegistry().setLoginRequired(true);
                        payload.getRegistry().setAuthType("ACR");
                        payload.getRegistry().setAuthDetails(null);
                        payload.getRegistry().setUsername(null);
                        payload.getRegistry().setPassword(null);
                        System.out.println("Private ECR registry " + ecrHost +
                                " resolved; using AWS workload identity without registry lookup");
                    } else {
                    scanStage = "registry lookup";
                    // Kubernetes discovery can create a scan for a private ECR
                    // registry before that registry is configured in Dashboard.
                    // Use the queued canonical hostname with Pod IAM in that case.
                    // API failures are not "registry not found" and must fail shut.
                    try {
                        DockerRegistriesResponseDto registries = api.dockerRegistriesControllerGetDockerRegistries(
                                null, null, "id", "asc",
                                null, null, payload.getRegistry().getHostname());
                        if (registries == null || !Boolean.TRUE.equals(registries.isSuccess()) ||
                                registries.getData() == null || registries.getData().getList() == null) {
                            throw new IOException("Registry API returned an incomplete response");
                        }
                        if (registries.getData().getList().isEmpty()) {
                            if (!canScanUnconfiguredRegistry(payload.getRegistry().getHostname())) {
                                throw new IOException("No configured registry matching queued image hostname");
                            }
                            // An ECR registry does not need manually stored AWS
                            // credentials when the Trawler service account uses
                            // IRSA/Pod Identity. Never change the hostname to Docker Hub.
                            payload.getRegistry().setLoginRequired(true);
                            payload.getRegistry().setAuthType("ACR");
                            System.out.println("Using AWS workload identity for newly discovered private ECR registry");
                        } else {
                            DockerRegistriesDto configured = registries.getData().getList().get(0);
                            Registry registry = new Registry();
                            registry.setId(Long.valueOf(configured.getId().toString()));
                            registry.setAliases(configured.getAliases());
                            registry.setHostname(configured.getHostname());
                            registry.setAuthType(configured.getAuthType());
                            registry.setName(configured.getName());
                            registry.setUsername(configured.getUsername());
                            registry.setPassword(configured.getPassword());
                            registry.setAuthDetails(configured.getAuthDetails());
                            registry.setLoginRequired(configured.isLoginRequired());
                            payload.setRegistry(registry);
                        }
                    } catch (Exception e) {
                        // Report the failing stage without printing registry credentials
                        // or a potentially sensitive HTTP response body.
                        System.err.println("Registry lookup failed for queued scan (" +
                                e.getClass().getSimpleName() + ")");
                        throw new IOException("Registry lookup failed", e);
                    }


                    }

                    scanStage = "policy lookup";
                    PoliciesByClusterResponse policies = api.policyControllerGetPoliciesByClusterId(
                            new BigDecimal(payload.getCluster().getId()));
                    if (!policies.isSuccess() || policies.getData() == null || policies.getData().isEmpty()) {
                        throw new IOException("No policies returned for queued cluster");
                    }

                    // Preserve the broker-assigned run identity across delivery retries
                    // and forward it to the authenticated Dash ingestion endpoint.
                    Object scanRunId = payload.getAdditionalProperties().get("scanRunId");
                    if (scanRunId instanceof String &&
                            ((String) scanRunId).matches("[0-9a-fA-F-]{36}")) {
                        defaultClient.addDefaultHeader("X-Scan-Run-Id", (String) scanRunId);
                    } else {
                        // Legacy jobs cannot be safely deduplicated; never inherit
                        // the previous delivery's identity on the shared API client.
                        defaultClient.addDefaultHeader("X-Scan-Run-Id", "");
                    }
                    try {
                        scanStage = "image scan and result ingestion";
                        new ScanRunner(api, payload, policies.getData()).scan();
                    } catch (NoncompliantException expectedFinding) {
                        // A noncompliant image is a completed scan, not an infrastructure error:
                        // ScanRunner raises this only after Dash accepts the report.
                        System.out.println("Scan persisted with noncompliant findings");
                    }
                    System.out.println("Image scan result accepted by Dash; acknowledging RabbitMQ delivery");
                    channel.basicAck(delivery.getEnvelope().getDeliveryTag(), false);
                } catch (Exception e) {
                    // Republish durably, verify broker confirmation, then ACK the original.
                    // This bounds poison-message loops while preserving failed scan evidence.
                    int previousRetries = retryCount(delivery.getProperties().getHeaders());
                    int nextRetries = previousRetries + 1;
                    String destination = nextRetries > MAX_SCAN_DELIVERY_RETRIES ? failedQueue : scanQueue;
                    System.err.println("Queued image scan failed at " + scanStage + "; retry " + nextRetries +
                            " routed to " + destination + ": " + e.getClass().getSimpleName());
                    try {
                        Map<String, Object> headers = new HashMap<>();
                        if (delivery.getProperties().getHeaders() != null) {
                            headers.putAll(delivery.getProperties().getHeaders());
                        }
                        headers.put("x-m9sweeper-retries", nextRetries);
                        AMQP.BasicProperties properties = new AMQP.BasicProperties.Builder()
                                .deliveryMode(2)
                                .contentType("application/json")
                                .headers(headers)
                                .build();
                        channel.basicPublish("", destination, properties, delivery.getBody());
                        channel.waitForConfirmsOrDie(10000);
                        channel.basicAck(delivery.getEnvelope().getDeliveryTag(), false);
                        if (destination.equals(failedQueue)) {
                            notifyQuarantinedScan(delivery.getBody());
                        }
                    } catch (Exception retryFailure) {
                        // If publication confirmation fails, preserve the original delivery.
                        System.err.println("Unable to confirm retry publication; broker will redeliver");
                        try {
                            channel.basicNack(delivery.getEnvelope().getDeliveryTag(), false, true);
                        } catch (Exception nackFailure) {
                            try { channel.close(); } catch (Exception ignored) { }
                        }
                    }
                }
            }, consumerTag -> {});
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Trawler startup interrupted", e);
        } catch (IOException e) {
            throw new IllegalStateException("Trawler RabbitMQ startup failed", e);
        } catch (Exception e) {
            // Picocli returns a nonzero exit status, allowing the Kubernetes
            // restart policy to recover instead of retaining a dead scanner.
            throw new IllegalStateException("Trawler startup failed", e);
        }
    }
}
