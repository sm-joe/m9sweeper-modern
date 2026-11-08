package io.m9sweeper.trawler;

import org.junit.jupiter.api.Test;
import java.util.HashMap;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.assertEquals;

class TrawlerRetryTest {
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
}
