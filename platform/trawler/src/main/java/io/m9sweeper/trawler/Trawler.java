package io.m9sweeper.trawler;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rabbitmq.client.Channel;
import com.rabbitmq.client.AMQP;
import com.rabbitmq.client.Connection;
import com.rabbitmq.client.ConnectionFactory;
import io.m9sweeper.trawler.commands.AbstractCommand;
import io.m9sweeper.trawler.commands.ScanCommand;
import io.m9sweeper.trawler.framework.TrawlerRunMode;
import io.m9sweeper.trawler.framework.client.api.M9SweeperApi;
import io.m9sweeper.trawler.framework.client.handler.ApiClient;
import io.m9sweeper.trawler.framework.client.handler.Configuration;
import io.m9sweeper.trawler.framework.client.handler.auth.ApiKeyAuth;
import io.m9sweeper.trawler.framework.client.model.DockerRegistriesDto;
import io.m9sweeper.trawler.framework.client.model.DockerRegistriesResponseDto;
import io.m9sweeper.trawler.framework.client.model.PoliciesByClusterResponse;
import io.m9sweeper.trawler.framework.queue.Message;
import io.m9sweeper.trawler.framework.queue.Registry;
import picocli.CommandLine;

import java.io.IOException;
import io.m9sweeper.trawler.framework.exception.NoncompliantException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeoutException;

@CommandLine.Command(name = "trawler", description = "Run Trawler in its RabbitMQ mode where it will monitor " +
        "a specified RabbitMQ queue for scan jobs.", subcommands = ScanCommand.class)
public class Trawler extends AbstractCommand implements Runnable {

    @CommandLine.Option(names = {"-u", "--rabbitmq-user"}, description = "username of the RabbitMQ server", order = 3)
    String rabbitmqUsername;

    @CommandLine.Option(names = {"-p", "--rabbitmq-password"}, description = "password of the RabbitMQ server", order = 4)
    String rabbitmqPassword;

    @CommandLine.Option(names = {"-H", "--rabbitmq-host"}, description = "hostname of the RabbitMQ server", order = 5)
    String rabbitmqHostname;

    @CommandLine.Option(names = {"-t", "--rabbitmq-port"}, description = "port of the RabbitMQ server", order = 6)
    int rabbitmqPort;

    @CommandLine.Option(names = {"-q", "--rabbitmq-queue"}, description = "name of the RabbitMQ queue to listen on", order = 7)
    String rabbitmqQueueName;

    /**
     * Run the main application for Trawler. This runs the default command, the basic trawler command which will start
     * the application in the rabbitmq mode.
     * @param args Application arguments from the CLI command launching trawler
     */
    public static void main(String[] args) {
        // Create an instance of the TrawlerConfiguration to ensure it fetches any
        // environment variables that have been set already in the .env file.
        TrawlerConfiguration.getInstance();

        // Launch the trawler command or its subcommands
        new CommandLine(new Trawler()).execute(args);
    }

    /**
     * Update the configuration based on variables that were passed into the application as CLI options
     */
    public void updateConfig() {
        // If the m9sweeper URL was defined, override what is declared in env vars
        if (m9sweeperUrl != null) {
            TrawlerConfiguration.getInstance().setM9sweeperUrl(m9sweeperUrl);
        }

        // If the m9sweeperApiKey was defined, override what is declared in the env vars
        if (m9sweeperApiKey != null) {
            TrawlerConfiguration.getInstance().setM9sweeperApiKey(m9sweeperApiKey);
        }

        // If the rabbitmqUsername was defined, override what is declared in the env vars
        if (rabbitmqUsername != null) {
            TrawlerConfiguration.getInstance().setRabbitmqUsername(rabbitmqUsername);
        }

        // If the rabbitmqPassword was defined, override what is declared in the env vars
        if (rabbitmqPassword != null) {
            TrawlerConfiguration.getInstance().setRabbitmqPassword(rabbitmqPassword);
        }

        // If the rabbitmqHostname was defined, override what is declared in the env vars
        if (rabbitmqHostname != null) {
            TrawlerConfiguration.getInstance().setRabbitmqHostname(rabbitmqHostname);
        }

        // Update the rabbitmqPort if the number provided by CLI is different than that of the env var
        if (rabbitmqPort != 0) {
            TrawlerConfiguration.getInstance().setRabbitmqPort(rabbitmqPort);
        }

        // If the rabbitmqQueueName was defined, override what is declared in the env vars
        if (rabbitmqQueueName != null) {
            TrawlerConfiguration.getInstance().setRabbitmqQueueName(rabbitmqQueueName);
        }
    }

    static final int MAX_SCAN_DELIVERY_RETRIES = 3;

    static int retryCount(Map<String, Object> headers) {
        if (headers == null) return 0;
        Object count = headers.get("x-m9sweeper-retries");
        if (count instanceof Number) return Math.max(0, ((Number) count).intValue());
        return 0;
    }

    private Connection getAmpqConnection(ConnectionFactory factory, int retry) throws InterruptedException {
        try {
            return factory.newConnection();
        } catch (IOException | TimeoutException e) {
            e.printStackTrace();
            if (retry > 0) {
                System.out.println("Error: Connection timed out to RabbitMQ server. Retrying....");
                Thread.sleep(factory.getNetworkRecoveryInterval());
                return getAmpqConnection(factory, --retry);
            }
            throw new RuntimeException("Failed to connect to RabbitMQ");
        }
    }

    /**
     * If this command is called, run trawler as a background service listening to the RabbitMQ server
     */
    @Override
    public void run() {
        updateConfig();
        TrawlerConfiguration.getInstance().setTrawlerRunMode(TrawlerRunMode.RABBITMQ);
        TrawlerConfiguration.getInstance().verifyConfig();

        // Configure the API client
        ApiClient defaultClient = Configuration.getDefaultApiClient();
        defaultClient.setBasePath(TrawlerConfiguration.getInstance().m9sweeperUrl());
        ApiKeyAuth xAuthToken = (ApiKeyAuth) defaultClient.getAuthentication("x-auth-token");
        xAuthToken.setApiKey(TrawlerConfiguration.getInstance().m9sweeperApiKey());
        M9SweeperApi api = new M9SweeperApi(defaultClient);

        // Configure the RabbitMQ Connection
        ConnectionFactory factory = new ConnectionFactory();
        factory.setHost(TrawlerConfiguration.getInstance().rabbitmqHostname());
        factory.setPort(TrawlerConfiguration.getInstance().rabbitmqPort());
        factory.setUsername(TrawlerConfiguration.getInstance().rabbitmqUsername());
        factory.setPassword(TrawlerConfiguration.getInstance().rabbitmqPassword());
        factory.setAutomaticRecoveryEnabled(true);
        factory.setTopologyRecoveryEnabled(true); 
        factory.setConnectionTimeout(5000);
        factory.setNetworkRecoveryInterval(5000);

        try {
            // Create the connection and connection channel to RabbitMQ
            Connection connection = getAmpqConnection(factory, 10);

            Channel channel = connection.createChannel();

            // Select the right RabbitMQ Queue to monitor
            String scanQueue = TrawlerConfiguration.getInstance().rabbitmqQueueName();
            String failedQueue = scanQueue + ".failed";
            channel.queueDeclare(scanQueue, true, false, false, null);
            // Quarantine permanently failing jobs without dropping the evidence.
            channel.queueDeclare(failedQueue, true, false, false, null);
            channel.confirmSelect();

            // Display a message stating that Trawler is listening for messages
            System.out.println("Trawler is waiting for scan jobs...");

            // Consume a message from the queue and execute the scan accordingly
            // Consumer ack happens only after Dash has accepted and persisted the scan result.
            channel.basicQos(1);
            channel.basicConsume(TrawlerConfiguration.getInstance().rabbitmqQueueName(), false, (consumerTag, delivery) -> {
                try {
                    ObjectMapper mapper = new ObjectMapper();

                    // Get the contents of the message
                    String message = new String(delivery.getBody(), StandardCharsets.UTF_8);
                    Message payload = mapper.readValue(message, Message.class);
                        
                    try {
                        DockerRegistriesResponseDto registries = api.dockerRegistriesControllerGetDockerRegistries(
                                null, null, "id", "asc",
                                null, null, payload.getRegistry().getHostname());
                        if (registries.getData().getList().isEmpty()) {
                            throw new RuntimeException("Invalid docker registry");
                        }

                        DockerRegistriesDto registriesDto = registries.getData().getList().get(0);

                        // convert to proper class name (for some reason its defined 2 different ways... go figure)
                        Registry registry = new Registry();
                        registry.setId(Long.valueOf(registriesDto.getId().toString()));
                        registry.setAliases(registriesDto.getAliases());
                        registry.setHostname(registriesDto.getHostname());
                        registry.setAuthType(registriesDto.getAuthType());
                        registry.setName(registriesDto.getName());
                        registry.setUsername(registriesDto.getUsername());
                        registry.setPassword(registriesDto.getPassword());
                        registry.setAuthDetails(registriesDto.getAuthDetails());
                        registry.setLoginRequired(registriesDto.isLoginRequired());

                        payload.setRegistry(registry);
                    } catch (Exception e) {
                        // Invalid registry credentials or API failures must not be mistaken for a scan.
                        throw new IOException("Registry lookup failed", e);
                    } 

                    if (payload == null || payload.getCluster() == null ||
                            payload.getCluster().getId() == null || payload.getImage() == null ||
                            payload.getImage().getId() == null || payload.getRegistry() == null) {
                        throw new IOException("Invalid queued image scan payload");
                    }

                    PoliciesByClusterResponse policies = api.policyControllerGetPoliciesByClusterId(
                            new BigDecimal(payload.getCluster().getId()));
                    if (!policies.isSuccess() || policies.getData() == null || policies.getData().isEmpty()) {
                        throw new IOException("No policies returned for queued cluster");
                    }

                    // Preserve the broker-assigned run identity across delivery retries
                    // and forward it to the authenticated Dash ingestion endpoint.
                    Object scanRunId = payload.getAdditionalProperties().get("scanRunId");
                    if (scanRunId instanceof String &&
                            ((String) scanRunId).matches("[0-9a-fA-F-]{36}")) {
                        defaultClient.addDefaultHeader("X-Scan-Run-Id", (String) scanRunId);
                    } else {
                        // Legacy jobs cannot be safely deduplicated; never inherit
                        // the previous delivery's identity on the shared API client.
                        defaultClient.addDefaultHeader("X-Scan-Run-Id", "");
                    }
                    try {
                        new ScanRunner(api, payload, policies.getData()).scan();
                    } catch (NoncompliantException expectedFinding) {
                        // A noncompliant image is a completed scan, not an infrastructure error:
                        // ScanRunner raises this only after Dash accepts the report.
                        System.out.println("Scan persisted with noncompliant findings");
                    }
                    channel.basicAck(delivery.getEnvelope().getDeliveryTag(), false);
                } catch (Exception e) {
                    // Republish durably, verify broker confirmation, then ACK the original.
                    // This bounds poison-message loops while preserving failed scan evidence.
                    int previousRetries = retryCount(delivery.getProperties().getHeaders());
                    int nextRetries = previousRetries + 1;
                    String destination = nextRetries > MAX_SCAN_DELIVERY_RETRIES ? failedQueue : scanQueue;
                    System.err.println("Queued image scan failed; retry " + nextRetries +
                            " routed to " + destination + ": " + e.getClass().getSimpleName());
                    try {
                        Map<String, Object> headers = new HashMap<>();
                        if (delivery.getProperties().getHeaders() != null) {
                            headers.putAll(delivery.getProperties().getHeaders());
                        }
                        headers.put("x-m9sweeper-retries", nextRetries);
                        AMQP.BasicProperties properties = new AMQP.BasicProperties.Builder()
                                .deliveryMode(2)
                                .contentType("application/json")
                                .headers(headers)
                                .build();
                        channel.basicPublish("", destination, properties, delivery.getBody());
                        channel.waitForConfirmsOrDie(10000);
                        channel.basicAck(delivery.getEnvelope().getDeliveryTag(), false);
                    } catch (Exception retryFailure) {
                        // If publication confirmation fails, preserve the original delivery.
                        System.err.println("Unable to confirm retry publication; broker will redeliver");
                        try {
                            channel.basicNack(delivery.getEnvelope().getDeliveryTag(), false, true);
                        } catch (Exception nackFailure) {
                            try { channel.close(); } catch (Exception ignored) { }
                        }
                    }
                }
            }, consumerTag -> {});
        } catch (IOException | InterruptedException e) {
            System.out.println("Error: Connection timed out to RabbitMQ server. Please check your configuration and try again.");
        } catch (Exception e) {
            e.printStackTrace();  // something else failed
        }
    }
}
