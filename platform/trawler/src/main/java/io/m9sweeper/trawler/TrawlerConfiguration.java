package io.m9sweeper.trawler;

import io.github.cdimascio.dotenv.Dotenv;
import io.github.cdimascio.dotenv.DotenvException;
import io.m9sweeper.trawler.framework.TrawlerRunMode;
import org.apache.commons.lang3.StringUtils;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class TrawlerConfiguration {
    // Stores the active instance of TrawlerConfiguration
    private static TrawlerConfiguration instance = null;

    // The active Dotenv accessor
    private static Dotenv dotenv = null;

    // The variables representing configuration options
    private Boolean debug = false; // whether debugging is turned on (will result in more log details)
    private String trawlerRunMode;
    private String m9sweeperUrl;
    private String m9sweeperApiKey;
    private String rabbitmqUsername;
    private String rabbitmqPassword;
    private String rabbitmqHostname;
    private Integer rabbitmqPort = 5672;
    private String rabbitmqQueueName;
    private String clusterName;
    private String dockerImageUrl;
    private String acr_access_key;
    private String acr_secret_key;
    private String acr_region_name;
    private String acr_output_format;

    /**
     * Sole constructor of TrawlerConfig
     */
    protected TrawlerConfiguration() {
        // Load the configuration options. Display an error and stop if one is malformed.
        try {
            dotenv = Dotenv.configure().ignoreIfMissing().load();
        } catch (DotenvException e) {
            System.out.println("Unable to parse the following configuration line: "+
                    e.getMessage().replace("Malformed entry ", ""));
            System.exit(1);
        }

        // Try loading the trawler run mode
        trawlerRunMode = dotenv.get("TRAWLER_RUN_MODE", "rabbitmq");

        // load debug flag
        debug = dotenv.get("DEBUG", "0").equals("1");

        // Load the URL to the m9sweeper instance
        m9sweeperUrl = StringUtils.stripEnd(dotenv.get("M9SWEEPER_URL", ""),"/");

        // Load the API key to the m9sweeper instance
        m9sweeperApiKey = dotenv.get("M9SWEEPER_API_KEY", "");

        // Load the username to RabbitMQ
        rabbitmqUsername = resolvedBrokerSetting("RABBITMQ_USERNAME", "RABBITMQ_USER_NAME");

        // Load the password to RabbitMQ
        rabbitmqPassword = resolvedBrokerSetting("RABBITMQ_PASSWORD", "RABBITMQ_USER_PASSWORD");

        // Load the hostname to RabbitMQ
        rabbitmqHostname = resolvedBrokerSetting("RABBITMQ_HOSTNAME", "RABBITMQ_HOST_NAME");

        // Load the port to RabbitMQ
        try {
            rabbitmqPort = Integer.parseInt(dotenv.get("RABBITMQ_PORT", "5672"));
        } catch (NumberFormatException e) {
            System.out.println("RABBITMQ_PORT: " + dotenv.get("RABBITMQ_PORT") + " is not a valid port. Please enter a valid integer port number or " +
                    "comment out/unset the configuration option to use the default option (5672).");
            System.exit(1);
        }

        // Load the queue name for RabbitMQ
        rabbitmqQueueName = resolvedBrokerSetting("RABBITMQ_QUEUE_NAME", "MSG_QUEUE_NAME_IMAGE_SCANNER");

        // Load the name of the cluster
        clusterName = dotenv.get("CLUSTER_NAME", "");

        // Load the docker URL of the cluster
        dockerImageUrl = dotenv.get("DOCKER_IMAGE_URL", "");

        // if full docker image url is not provided, will provide default hostname and tag name
        Pattern p = Pattern.compile("^([a-zA-Z0-9]+\\.[a-zA-Z0-9\\.]+)?\\/?([a-zA-Z0-9\\/]+)?\\:?([a-zA-Z0-9\\.]+)?$");
        Matcher m = p.matcher(dockerImageUrl);
        if (m.matches()){
            String hostname = m.group(1) != null ? m.group(1) : "docker.io";
            String imagename = m.group(2);
            String tagname = m.group(3) != null ? m.group(3) : "latest";

            dockerImageUrl = hostname + "/" + imagename + ":" + tagname;
        }
    }

    /**
     * Accept both the original documented Dash-style Secret keys and the
     * Trawler-specific keys. Explicit Trawler names win when both exist;
     * missing values never silently fall back to the RabbitMQ guest account.
     * This keeps existing Kubernetes Secrets compatible across Helm upgrades.
     */
    private static String resolvedBrokerSetting(String preferred, String legacy) {
        return selectBrokerSetting(dotenv.get(preferred), dotenv.get(legacy));
    }

    // Pure resolver keeps both documented environment spellings testable.
    static String selectBrokerSetting(String preferred, String legacy) {
        if (preferred != null && !preferred.isBlank()) {
            return preferred;
        }
        return legacy == null ? "" : legacy;
    }

    /**
     * Returns a thread-safe, singleton instance of TrawlerConfig. This
     * can be used to access the .env file or environment variables used to configure Trawler.
     * <p>
     * When this is called, if an existing Config has already been instantiated, then this will
     * simply return the existing instance. Otherwise it will create a new instance and then return
     * that new instance.
     * <p>
     *
     * @return an instance of the trawler application configuration
     * @see TrawlerConfiguration
     */
    public synchronized static TrawlerConfiguration getInstance() {
        // If there is not an existing instance, create a new one
        if (instance == null) {
            instance = new TrawlerConfiguration();
        }

        // Return an instance of TrawlerConfiguration
        return instance;
    }

    /**
     * Return the mode that trawler should run in based off the configuration options
     * that were set in the .env or system environment. Defaults to rabbitmq.
     * @return trawler run mode
     */
    public TrawlerRunMode trawlerRunMode() {
        if (trawlerRunMode.equalsIgnoreCase("standalone")) {
            return TrawlerRunMode.STANDALONE;
        } else if (trawlerRunMode.equalsIgnoreCase("rabbitmq")) {
            return TrawlerRunMode.RABBITMQ;
        } else return TrawlerRunMode.UNKNOWN;
    }

    public void setTrawlerRunMode(TrawlerRunMode runMode) {
        if (runMode == TrawlerRunMode.RABBITMQ) {
            trawlerRunMode = "rabbitmq";
        } else if (runMode == TrawlerRunMode.STANDALONE) {
            trawlerRunMode = "standalone";
        } else trawlerRunMode = "unknown";
    }

    /**
     * Return the URL of the m9sweeper instance that Trawler will connect to.
     * @return m9sweeper URL
     */
    public String m9sweeperUrl() {
        return m9sweeperUrl;
    }

    public void setM9sweeperUrl(String url) {
        this.m9sweeperUrl = url;
    }

    /**
     * Return the API Key of the m9sweeper instance Trawler will connect to.
     * @return m9sweeper api key
     */
    public String m9sweeperApiKey() {
        return m9sweeperApiKey;
    }

    public void setM9sweeperApiKey(String apiKey) {
        this.m9sweeperApiKey = apiKey;
    }

    /**
     * Return the username of the RabbitMQ server. Defaults to guest.
     * @return rabbitmq username
     */
    public String rabbitmqUsername() {
        return rabbitmqUsername;
    }

    public void setRabbitmqUsername(String username) {
        this.rabbitmqUsername = username;
    }

    /**
     * Return the password of the RabbitMQ server. Defaults to guest.
     * @return rabbitmq password
     */
    public String rabbitmqPassword() {
        return rabbitmqPassword;
    }

    public void setRabbitmqPassword(String password) {
        this.rabbitmqPassword = password;
    }

    /**
     * Return the hostname of the RabbitMQ server. Defaults to rabbitmq.
     * @return rabbitmq hostname
     */
    public String rabbitmqHostname() {
        return rabbitmqHostname;
    }

    public void setRabbitmqHostname(String hostname) {
        this.rabbitmqHostname = hostname;
    }

    /**
     * Return the port of the RabbitMQ server. Defaults to 5672.
     * @return rabbitmq port
     */
    public int rabbitmqPort() {
        return rabbitmqPort;
    }

    public void setRabbitmqPort(int port) {
        this.rabbitmqPort = port;
    }

    /**
     * Return the name of the RabbitMQ Queue to listen on. Defaults to trawler_queue
     * @return queue name
     */
    public String rabbitmqQueueName() {
        return rabbitmqQueueName;
    }

    public void setRabbitmqQueueName(String queueName) {
        this.rabbitmqQueueName = queueName;
    }

    /**
     * Return the cluster name in m9sweeper that the results will be published too
     * @return cluster name
     */
    public String clusterName() {
        return clusterName;
    }

    public void setClusterName(String name) {
        this.clusterName = name;
    }

    /**
     * Return the URL of the docker image to scan
     * @return image url
     */
    public String dockerImageUrl() {
        return dockerImageUrl;
    }

    public void setDockerImageUrl(String imageUrl) {
        this.dockerImageUrl = imageUrl;
    }

    /**
     * Verify the configuration values provided through env variables or the CLI command line are valid
     * and that nothing is missing based on the defined run mode.
     */
    public void verifyConfig() throws AssertionError {
        // Verify that the M9Sweeper URL is populated
        if (m9sweeperUrl().isEmpty()) {
            throw new AssertionError("M9SWEEPER_URL is blank. Please define the URL to your m9sweeper instance.");
        } else if (!m9sweeperUrl().matches("^(https|http)://[-a-zA-Z0-9+&@#/%?=~_|!:,.;]*[-a-zA-Z0-9+&@#/%=~_|]")) {
            throw new AssertionError("M9SWEEPER_URL: " + m9sweeperUrl() + " is not a valid url. Please check your configuration settings.");
        }

        // Verify that the M9Sweeper api-key is populated
        if (m9sweeperApiKey.isEmpty()) {
            throw new AssertionError("M9SWEEPER_API_KEY is blank. Please define the API key to your m9sweeper instance.");
        }

        // Verify that the run mode is a valid run mode
        if (trawlerRunMode() == TrawlerRunMode.UNKNOWN) {
            throw new AssertionError("TRAWLER_RUN_MODE: " + trawlerRunMode + " is not a valid run mode. " +
                    "Valid options are standalone or rabbitmq (default).");
        } else if (trawlerRunMode() == TrawlerRunMode.RABBITMQ) {
            // Verify that the RabbitMQ username is not blank
            if (rabbitmqUsername().isBlank()) {
                throw new AssertionError("RABBITMQ_USERNAME is blank. Set RABBITMQ_USERNAME in the Trawler environment Secret (Dash uses RABBITMQ_USER_NAME).");
            }

            // Verify that the RabbitMQ password is not blank
            if (rabbitmqPassword().isBlank()) {
                throw new AssertionError("RABBITMQ_PASSWORD is blank. Set RABBITMQ_PASSWORD in the Trawler environment Secret (Dash uses RABBITMQ_USER_PASSWORD).");
            }

            // Verify that the RabbitMQ hostname is not blank
            if (rabbitmqHostname().isBlank()) {
                throw new AssertionError("RABBITMQ_HOSTNAME is blank. Set RABBITMQ_HOSTNAME in the Trawler environment Secret (Dash uses RABBITMQ_HOST_NAME).");
            }

            // Verify that the RabbitMQ queue name is not blank
            if (rabbitmqQueueName.isBlank()) {
                throw new AssertionError("RABBITMQ_QUEUE_NAME is blank. Set RABBITMQ_QUEUE_NAME in the Trawler environment Secret (Dash uses MSG_QUEUE_NAME_IMAGE_SCANNER).");
            }
        } else if (trawlerRunMode() == TrawlerRunMode.STANDALONE) {
            if (clusterName.isEmpty()) {
                throw new AssertionError("CLUSTER_NAME is blank. Please define the cluster name that Trawler will report scan " +
                        "results back too.");
            }

            if (dockerImageUrl.isEmpty()) {
                throw new AssertionError("DOCKER_IMAGE_URL is blank. Please define the url for the docker image that Trawler " +
                        "should scan.");
            }
        }
    }

    public Boolean getDebug() {
        return debug;
    }

    public void setDebug(Boolean debug) {
        this.debug = debug;
    }
}
