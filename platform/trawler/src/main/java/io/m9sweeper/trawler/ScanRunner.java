package io.m9sweeper.trawler;

import io.m9sweeper.trawler.framework.client.api.M9SweeperApi;
import io.m9sweeper.trawler.framework.client.model.*;
import io.m9sweeper.trawler.framework.docker.DockerImageBuilder;
import io.m9sweeper.trawler.framework.docker.DockerRegistryBuilder;
import io.m9sweeper.trawler.framework.exception.NoncompliantException;
import io.m9sweeper.trawler.framework.policies.Policy;
import io.m9sweeper.trawler.framework.queue.Message;
import io.m9sweeper.trawler.framework.scans.*;
import io.m9sweeper.trawler.scanners.Trivy;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

public class ScanRunner {

    private final M9SweeperApi apiInstance;
    private final Message message;
    private final List<PolicyWithScannerDto> policies;

    public ScanRunner(M9SweeperApi apiInstance, Message message, List<PolicyWithScannerDto> policies) {
        this.apiInstance = apiInstance;
        this.message = message;
        this.policies = policies;
    }

    public void scan() throws Exception {
        ScanConfig scanConfig = new ScanConfig();
        scanConfig.setImage(new DockerImageBuilder(message.getImage().getId().intValue())
                .withName(message.getImage().getName())
                .withTag(message.getImage().getTag())
                .withHash(message.getImage().getHash())
                .withRegistry(new DockerRegistryBuilder(message.getRegistry().getHostname(), message.getRegistry().getLoginRequired(), message.getRegistry().getAuthType(), message.getRegistry().getAuthDetails())
                        .withAliases(message.getRegistry().getAliases())
                        .withName(message.getRegistry().getName())
                        .withUsername(message.getRegistry().getUsername())
                        .withPassword(message.getRegistry().getPassword())
                        .build())
                .build());

        long scanStartedAt = System.currentTimeMillis();

        ArrayList<ScanResult> scanResults = new ArrayList<>(0);

        String newImageHash = "";

        if (policies == null || policies.isEmpty()) {
            throw new IllegalStateException("No scan policies were supplied; refusing to mark an image scan complete");
        }
        if (policies != null && policies.size() > 0) {
            for (PolicyWithScannerDto policyWithScannerDto: policies) {
                if (!policyWithScannerDto.isEnabled()) {
                    continue;
                }

                ScanResultBuilder scanResultBuilder = new ScanResultBuilder(scanConfig.getImage())
                        .withStartedAt(scanStartedAt)
                        .withPolicy(policyWithScannerDto.getId().longValue());

                ArrayList<ScanResultIssue> scanResultIssues = new ArrayList<>();
                boolean scannerExecuted = false;
                boolean anyScannerFailed = false;
                List<String> scannerFailures = new ArrayList<>();

                if (policyWithScannerDto.getScanners() != null && !policyWithScannerDto.getScanners().isEmpty()) {
                    for (ScannerDto scannerDto : policyWithScannerDto.getScanners()) {
                        if (scannerDto == null || !scannerDto.isEnabled()) {
                            continue;
                        }
                        scannerExecuted = true;
                        try {
                            if (scannerDto.getType().toUpperCase().equals(ScannerType.TRIVY.name())) {
                                scanConfig.setScanId(scannerDto.getId().intValue());
                                scanConfig.setScannerName(scannerDto.getName());
                                scanConfig.setPolicy(new Policy() {{
                                    setEnforced(policyWithScannerDto.isEnforcement());
                                    setName(policyWithScannerDto.getName());
                                }});
                                Trivy t = new Trivy();
                                t.initScanner(scanConfig);
                                t.run();
                                scanResultIssues.addAll(t.getScanResult());
                                newImageHash = t.getImageHash();
                            } else {
                                System.out.println("Scanner " + scannerDto.getType().toUpperCase() + " is not implemented yet.");
                                throw new UnsupportedOperationException("Scanner " + scannerDto.getType().toUpperCase() + " is not implemented yet.");
                            }
                        } catch (Exception e) {
                            anyScannerFailed = true;
                            scannerFailures.add("Scanner failed: " + (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()));
                        }
                    }
                }
                if (!scannerExecuted) {
                    scannerFailures.add("No enabled scanner found for policy");
                }
                scanResultBuilder.withEncounteredError(scanHasFailed(scannerExecuted, anyScannerFailed));
                scanResultBuilder.withSummary(String.join("; ", scannerFailures));

                int totalCriticalIssues = 0;
                int totalHighIssues = 0;
                int totalMediumIssues = 0;
                int totalLowIssues = 0;
                int totalNegligibleIssues = 0;

                if (TrawlerConfiguration.getInstance().getDebug()) System.out.println("scanResultIssues: " + scanResultIssues.size());

                if (scanResultIssues.size() > 0) {
                    for(ScanResultIssue scanResultIssue: scanResultIssues) {
                        if (scanResultIssue.getSeverity().equals(IssueSeverity.CRITICAL)) {
                            totalCriticalIssues++;
                        } else if (scanResultIssue.getSeverity().equals(IssueSeverity.HIGH)) {
                            totalHighIssues++;
                        } else if (scanResultIssue.getSeverity().equals(IssueSeverity.MEDIUM)) {
                            totalMediumIssues++;
                        } else if (scanResultIssue.getSeverity().equals(IssueSeverity.LOW)) {
                            totalLowIssues++;
                        } else if (scanResultIssue.getSeverity().equals(IssueSeverity.UNKNOWN) || scanResultIssue.getSeverity().equals(IssueSeverity.NEGLIGIBLE)) {
                            totalNegligibleIssues++;
                        }
                    }
                }

                scanResultBuilder.withNumCriticalIssues(totalCriticalIssues)
                        .withNumHighIssues(totalHighIssues)
                        .withNumMediumIssues(totalMediumIssues)
                        .withNumLowIssues(totalLowIssues)
                        .withNumNegligibleIssues(totalNegligibleIssues)
                        .withIssues(scanResultIssues)
                        .withFinishedAt(System.currentTimeMillis())
                        .withHash(newImageHash);

                scanResults.add(scanResultBuilder.build());
            }
        }

        if (scanResults.isEmpty()) {
            throw new IllegalStateException("No enabled scan policies executed; refusing to mark an image scan complete");
        }

        if (TrawlerConfiguration.getInstance().getDebug()) {
            System.out.println("Scan Results: " + scanResults.toString());
        }

        List<ImageTrawlerResultDto> imageTrawlerResultDtos = scanResults.stream()
                .map(scanResult -> new ImageTrawlerResultDto()
                .summary(scanResult.getSummary())
                .encounterError(scanResult.isEncounteredError())
                .criticalIssues(new BigDecimal(scanResult.getNumCriticalIssues()))
                .majorIssues(new BigDecimal(scanResult.getNumHighIssues()))
                .mediumIssues(new BigDecimal(scanResult.getNumMediumIssues()))
                .lowIssues(new BigDecimal(scanResult.getNumLowIssues()))
                .negligibleIssues(new BigDecimal(scanResult.getNumNegligibleIssues()))
                .policyId(new BigDecimal(scanResult.getPolicyId()))
                .policyStatus(isScanCompliant(scanResult))
                .startedAt(new BigDecimal(scanResult.getStartedAt()))
                .finishedAt(new BigDecimal(scanResult.getFinishedAt()))
                .imageHash(scanResult.getImageHash())
                .issues(scanResult.getIssues().stream().map(o ->
                        new ScanImageIssue()
                                .scannerId(new BigDecimal(o.getScannerId()))
                                .scannerName(o.getScannerName())
                                .name(o.getName())
                                .type(o.getType())
                                .vulnerabilityDescUrl(o.getVulnerabilityDescUrl())
                                .severity(o.getSeverity().toString())
                                .description(o.getDescription())
                                .isCompliant(o.isCompliant())
                                .isFixable(o.isFixable())
                                .wasFixed(false)
                                .data(o.getExtraData())
                ).collect(Collectors.toList()))).collect(Collectors.toList());

        saveScanResults(imageTrawlerResultDtos);
    }

    /** Failure is sticky across a policy's scanners; later successes cannot clear it. */
    static boolean scanHasFailed(boolean scannerExecuted, boolean anyScannerFailed) {
        return !scannerExecuted || anyScannerFailed;
    }

    /** Never mark an incomplete or failed scanner run as policy compliant. */
    static boolean isScanCompliant(ScanResult report) {
        return !report.isEncounteredError() &&
               report.getNumCriticalIssues() == 0 && report.getNumHighIssues() == 0;
    }

    /** Throws an error if the image is not compliant  */
    private void saveScanResults(List<ImageTrawlerResultDto> imageTrawlerResultDtos) throws Exception {
        TrawlerScanResults body = new TrawlerScanResults();
        body.setData(imageTrawlerResultDtos);
        if (TrawlerConfiguration.getInstance().getDebug()) {
            System.out.println("Saving Scan Results: " + body.toString());
        }
        ImageScanResultSaveResponse complianceResponse = apiInstance.imageControllerSaveImageScanResults(body, new BigDecimal(message.getCluster().getId()), new BigDecimal(message.getImage().getId()));
        if (complianceResponse.getData() != null && !complianceResponse.getData().isComplaint()) {
            throw new NoncompliantException("Image Is not compliant", imageTrawlerResultDtos);
        }
    }
}
