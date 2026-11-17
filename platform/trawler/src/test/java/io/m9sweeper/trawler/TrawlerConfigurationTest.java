package io.m9sweeper.trawler;

import io.m9sweeper.trawler.framework.TrawlerRunMode;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class TrawlerConfigurationTest {
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

    @Test void defaultGuestMustFailClosed() {
        var c = config();
        c.setRabbitmqUsername("guest");
        assertThrows(AssertionError.class, c::verifyConfig);
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
