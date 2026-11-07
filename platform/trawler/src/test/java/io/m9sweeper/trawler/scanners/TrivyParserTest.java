package io.m9sweeper.trawler.scanners;

import io.m9sweeper.trawler.framework.scans.*;
import org.junit.jupiter.api.Test;
import java.lang.reflect.Field;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/** Regression tests for the actual production Trivy JSON parser, not a mock scanner. */
class TrivyParserTest {

    private Trivy parse(String json) throws Exception {
        Trivy scanner = new Trivy();
        ScanConfig config = new ScanConfig();
        config.setScanId(1);
        config.setScannerName("Trivy");
        scanner.initScanner(config);
        scanner.prepSystem();
        Field field = Trivy.class.getDeclaredField("rawResults");
        field.setAccessible(true);
        field.set(scanner, json);
        scanner.parseResults();
        return scanner;
    }

    @Test void criticalAndHighAreNotMarkedCompliant() throws Exception {
        String json = "{\"Results\":[{\"Vulnerabilities\":["
            + "{\"Severity\":\"CRITICAL\",\"VulnerabilityID\":\"CVE-1\"},"
            + "{\"Severity\":\"HIGH\",\"VulnerabilityID\":\"CVE-2\"},"
            + "{\"Severity\":\"LOW\",\"VulnerabilityID\":\"CVE-3\"}]}]}";
        List<ScanResultIssue> issues = parse(json).getScanResult();
        assertEquals(3, issues.size());
        assertEquals(IssueSeverity.CRITICAL, issues.get(0).getSeverity());
        assertFalse(issues.get(0).isCompliant());
        assertFalse(issues.get(1).isCompliant());
        assertTrue(issues.get(2).isCompliant());
    }

    @Test void missingSeverityIsRetainedForReview() throws Exception {
        List<ScanResultIssue> issues = parse("{\"Results\":[{\"Vulnerabilities\":[{\"VulnerabilityID\":\"CVE-UNKNOWN\"}]}]}")
            .getScanResult();
        assertEquals(1, issues.size());
        assertEquals(IssueSeverity.UNKNOWN, issues.get(0).getSeverity());
        assertFalse(issues.get(0).isCompliant());
    }

    @Test void absentScanResultFailsClosed() {
        IllegalStateException exception = assertThrows(IllegalStateException.class,
            () -> parse("null"));
        assertTrue(exception.getMessage().contains("refusing"));
    }

    @Test void missingDigestDoesNotCrashScanner() throws Exception {
        Trivy scanner = parse("{\"Metadata\":{\"RepoDigests\":[]},\"Results\":[]}");
        assertTrue(scanner.getScanResult().isEmpty());
        assertEquals("", scanner.getImageHash());
    }
}
