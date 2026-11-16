package io.m9sweeper.trawler;

import io.m9sweeper.trawler.framework.scans.ScanResult;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.Collections;

import static org.junit.jupiter.api.Assertions.*;

class ScanRunnerIngestionGuardTest {
    @Test
    void successfulScanCanBePersisted() {
        ScanResult successful = new ScanResult();
        successful.setEncounteredError(false);
        assertFalse(ScanRunner.hasIncompleteScanResults(Collections.singletonList(successful)));
    }

    @Test
    void failedScannerMustNotBeReportedAsCompleted() {
        ScanResult failed = new ScanResult();
        failed.setEncounteredError(true);
        assertTrue(ScanRunner.hasIncompleteScanResults(Collections.singletonList(failed)));
    }

    @Test
    void mixedResultsFailClosedEvenWhenAnotherPolicySucceeds() {
        ScanResult successful = new ScanResult();
        ScanResult failed = new ScanResult();
        failed.setEncounteredError(true);
        assertTrue(ScanRunner.hasIncompleteScanResults(Arrays.asList(successful, failed)));
    }

    @Test
    void missingResultsCannotBeAcknowledged() {
        assertTrue(ScanRunner.hasIncompleteScanResults(null));
        assertTrue(ScanRunner.hasIncompleteScanResults(Collections.emptyList()));
        assertTrue(ScanRunner.hasIncompleteScanResults(Arrays.asList(new ScanResult(), null)));
    }
}
