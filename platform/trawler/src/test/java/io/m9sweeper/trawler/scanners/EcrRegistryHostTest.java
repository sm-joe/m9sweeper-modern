package io.m9sweeper.trawler.scanners;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class EcrRegistryHostTest {
    @Test
    void acceptsPrivateEcrAndDerivesRegionFromHostNotGlobalClusterUrl() {
        String host = "602401143452.dkr.ecr.us-east-1.amazonaws.com";
        assertTrue(Trivy.isPrivateEcrHost(host));
        assertEquals("us-east-1", Trivy.privateEcrRegion(host));
        assertTrue(Trivy.isPrivateEcrHost("123456789012.dkr.ecr.ap-south-1.amazonaws.com"));
    }

    @Test
    void doesNotMisclassifyDockerHubPublicEcrOrFakeEcrDomains() {
        assertFalse(Trivy.isPrivateEcrHost("docker.io"));
        assertFalse(Trivy.isPrivateEcrHost("public.ecr.aws"));
        assertFalse(Trivy.isPrivateEcrHost("602401143452.dkr.ecr.us-east-1.amazonaws.com.evil.com"));
        assertFalse(Trivy.isPrivateEcrHost(null));
        assertThrows(IllegalArgumentException.class, () -> Trivy.privateEcrRegion("docker.io"));
    }

    @Test
    void supportsFipsAndChinaEcrHostnameFormats() {
        assertTrue(Trivy.isPrivateEcrHost("123456789012.dkr.ecr-fips.us-gov-west-1.amazonaws.com"));
        assertEquals("cn-north-1", Trivy.privateEcrRegion(
                "918309763551.dkr.ecr.cn-north-1.amazonaws.com.cn"));
    }
}
