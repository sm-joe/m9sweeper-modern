package io.m9sweeper.trawler;

import org.junit.jupiter.api.Test;
import com.rabbitmq.client.Connection;
import com.rabbitmq.client.ConnectionFactory;
import java.io.IOException;
import java.util.concurrent.TimeoutException;
import java.util.HashMap;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class TrawlerRetryTest {
    @Test
    void exhaustedStartupRetriesFailInsteadOfReturningNormally() {
        ConnectionFactory failingBroker = new ConnectionFactory() {
            @Override
            public Connection newConnection() throws IOException, TimeoutException {
                throw new IOException("Simulated connection refusal");
            }
        };
        assertThrows(IllegalStateException.class,
            () -> new Trawler().getAmpqConnection(failingBroker, 0));
    }

    @Test
    void missingAttemptHeaderIsFirstDelivery() {
        assertEquals(0, Trawler.retryCount(null));
        assertEquals(0, Trawler.retryCount(Map.of()));
    }

    @Test
    void preservesRetryCountFromBrokerHeaders() {
        Map<String, Object> headers = new HashMap<>();
        headers.put("x-m9sweeper-retries", 2);
        assertEquals(2, Trawler.retryCount(headers));
        assertEquals(3, Trawler.MAX_SCAN_DELIVERY_RETRIES);
    }

    @Test
    void malformedAndNegativeRetryValuesDoNotProduceInvalidCounts() {
        assertEquals(0, Trawler.retryCount(Map.of("x-m9sweeper-retries", "n/a")));
        assertEquals(0, Trawler.retryCount(Map.of("x-m9sweeper-retries", -12)));
    }
    @Test
    void automaticallyDiscoveredPrivateEcrRegistryCanUsePodIdentity() {
        org.junit.jupiter.api.Assertions.assertTrue(
            Trawler.canScanUnconfiguredRegistry("602401143452.dkr.ecr.us-east-1.amazonaws.com"));
        org.junit.jupiter.api.Assertions.assertTrue(
            Trawler.canScanUnconfiguredRegistry("123456789012.dkr.ecr.eu-west-1.amazonaws.com"));
    }

    @Test
    void missingOrUntrustedRegistriesMustNotBypassRegistryConfiguration() {
        org.junit.jupiter.api.Assertions.assertFalse(Trawler.canScanUnconfiguredRegistry("docker.io"));
        org.junit.jupiter.api.Assertions.assertFalse(Trawler.canScanUnconfiguredRegistry(null));
        org.junit.jupiter.api.Assertions.assertFalse(
            Trawler.canScanUnconfiguredRegistry("602401143452.dkr.ecr.us-east-1.amazonaws.com.evil.example"));
    }

    @Test
    void privateEcrRegistryIsIdentifiedFromEveryQueuedImageWithoutRegistryConfiguration() {
        io.m9sweeper.trawler.framework.queue.Message job =
                new io.m9sweeper.trawler.framework.queue.Message();
        io.m9sweeper.trawler.framework.queue.Image image =
                new io.m9sweeper.trawler.framework.queue.Image();
        image.setUrl("602401143452.dkr.ecr.us-east-1.amazonaws.com");
        image.setName("amazon/aws-network-policy-agent");
        image.setTag("v1.4.0-eksbuild.1");
        io.m9sweeper.trawler.framework.queue.Registry registry =
                new io.m9sweeper.trawler.framework.queue.Registry();
        registry.setHostname("602401143452.dkr.ecr.us-east-1.amazonaws.com");
        job.setImage(image);
        job.setRegistry(registry);
        assertEquals("602401143452.dkr.ecr.us-east-1.amazonaws.com",
                Trawler.canonicalPrivateEcrHost(job));
        image.setName("amazon-k8s-cni");
        image.setTag("v1.22.4-eksbuild.10");
        assertEquals("602401143452.dkr.ecr.us-east-1.amazonaws.com",
                Trawler.canonicalPrivateEcrHost(job));
    }

    @Test
    void neverOverrideNonEcrImagesWithAnUnrelatedEcrRegistry() {
        io.m9sweeper.trawler.framework.queue.Message job =
                new io.m9sweeper.trawler.framework.queue.Message();
        io.m9sweeper.trawler.framework.queue.Image image =
                new io.m9sweeper.trawler.framework.queue.Image();
        image.setUrl("docker.io");
        io.m9sweeper.trawler.framework.queue.Registry registry =
                new io.m9sweeper.trawler.framework.queue.Registry();
        registry.setHostname("602401143452.dkr.ecr.us-east-1.amazonaws.com");
        job.setImage(image);
        job.setRegistry(registry);
        org.junit.jupiter.api.Assertions.assertNull(Trawler.canonicalPrivateEcrHost(job));
        image.setUrl("registry.k8s.io");
        org.junit.jupiter.api.Assertions.assertNull(Trawler.canonicalPrivateEcrHost(job));
    }

}
