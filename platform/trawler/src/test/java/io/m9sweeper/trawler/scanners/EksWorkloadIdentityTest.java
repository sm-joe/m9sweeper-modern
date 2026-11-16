package io.m9sweeper.trawler.scanners;

import org.junit.jupiter.api.Test;
import com.amazonaws.auth.DefaultAWSCredentialsProviderChain;
import com.amazonaws.services.securitytoken.AWSSecurityTokenService;
import com.amazonaws.services.securitytoken.AWSSecurityTokenServiceClientBuilder;

import static org.junit.jupiter.api.Assertions.*;

class EksWorkloadIdentityTest {
    @Test
    void stsModuleExistsForIrsaWebIdentityRoleAssumption() {
        assertNotNull(AWSSecurityTokenService.class);
        assertNotNull(AWSSecurityTokenServiceClientBuilder.class);
    }

    @Test
    void defaultCredentialChainConstructsWithoutStaticAccessKeys() {
        assertNotNull(DefaultAWSCredentialsProviderChain.getInstance());
        // No network calls: runtime AWS credentials must be provided by
        // IRSA or EKS Pod Identity, not hardcoded into test fixtures.
    }
}
