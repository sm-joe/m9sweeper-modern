package io.m9sweeper.trawler;

import io.m9sweeper.trawler.framework.scans.ScanResultBuilder;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class ScanRunnerComplianceTest {
    @Test void scannerFailureWithZeroIssuesIsNotCompliant() {
        var report = new ScanResultBuilder(null)
                .withEncounteredError(true).withNumCriticalIssues(0)
                .withNumHighIssues(0).build();
        assertFalse(ScanRunner.isScanCompliant(report));
    }

    @Test void highOrCriticalFindingIsNotCompliant() {
        assertFalse(ScanRunner.isScanCompliant(new ScanResultBuilder(null)
                .withNumHighIssues(1).build()));
        assertFalse(ScanRunner.isScanCompliant(new ScanResultBuilder(null)
                .withNumCriticalIssues(1).build()));
    }

    @Test void laterSuccessfulScannerCannotEraseEarlierFailure() {
        assertTrue(ScanRunner.scanHasFailed(true, true));
        assertTrue(ScanRunner.scanHasFailed(false, false));
        assertTrue(ScanRunner.scanHasFailed(false, true));
        assertFalse(ScanRunner.scanHasFailed(true, false));
    }

    @Test void successfulZeroFindingRunCanBeCompliant() {
        var report = new ScanResultBuilder(null).withEncounteredError(false)
                .withNumCriticalIssues(0).withNumHighIssues(0).build();
        assertTrue(ScanRunner.isScanCompliant(report));
    }
}
