package io.m9sweeper.trawler;

import io.m9sweeper.trawler.framework.TrawlerRunMode;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class TrawlerConfigurationTest {
    @Test void originalDocumentedBrokerKeysStillResolve() {
        assertEquals("m9sweeper", TrawlerConfiguration.selectBrokerSetting(null, "m9sweeper"));
        assertEquals("broker-pass", TrawlerConfiguration.selectBrokerSetting("", "broker-pass"));
        assertEquals("trawler_queue", TrawlerConfiguration.selectBrokerSetting(" ", "trawler_queue"));
        assertEquals("broker.svc.cluster.local",
            TrawlerConfiguration.selectBrokerSetting(null, "broker.svc.cluster.local"));
    }

    @Test void explicitCanonicalBrokerValuesTakePrecedence() {
        assertEquals("new-broker",
            TrawlerConfiguration.selectBrokerSetting("new-broker", "legacy-broker"));
        assertEquals("", TrawlerConfiguration.selectBrokerSetting(null, null));
    }

    private TrawlerConfiguration config() {
        var config = new TrawlerConfiguration();
        config.setM9sweeperUrl("http://m9sweeper-dash:3000");
        config.setM9sweeperApiKey("safe-ci-scanner-api-key-long-enough");
        config.setTrawlerRunMode(TrawlerRunMode.RABBITMQ);
        config.setRabbitmqHostname("m9sweeper-rabbitmq");
        config.setRabbitmqUsername("m9");
        config.setRabbitmqPassword("safe-ci-broker-password");
        config.setRabbitmqQueueName("trawler_queue");
        return config;
    }

    @Test void completeBrokerConfigurationAccepted() {
        assertDoesNotThrow(() -> config().verifyConfig());
    }

    @Test void missingBrokerUsernameMustNotUseGuest() {
        var c = config();
        c.setRabbitmqUsername("");
        assertTrue(assertThrows(AssertionError.class, c::verifyConfig).getMessage()
            .contains("RABBITMQ_USERNAME"));
    }

    @Test void explicitlyConfiguredLegacyBrokerUsernameRemainsSupported() {
        var c = config();
        c.setRabbitmqUsername("guest");
        assertDoesNotThrow(c::verifyConfig);
    }

    @Test void blankPasswordMustBeReportedBeforeRabbitConnection() {
        var c = config();
        c.setRabbitmqPassword(" ");
        assertTrue(assertThrows(AssertionError.class, c::verifyConfig).getMessage()
            .contains("RABBITMQ_PASSWORD"));
    }

    @Test void missingBrokerHostnameMustBeReported() {
        var c = config();
        c.setRabbitmqHostname("");
        assertTrue(assertThrows(AssertionError.class, c::verifyConfig).getMessage()
            .contains("RABBITMQ_HOSTNAME"));
    }

    @Test void missingQueueMustBeReported() {
        var c = config();
        c.setRabbitmqQueueName("");
        assertTrue(assertThrows(AssertionError.class, c::verifyConfig).getMessage()
            .contains("RABBITMQ_QUEUE_NAME"));
    }
}
