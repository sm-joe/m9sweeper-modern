describe('RabbitMQ production credential policy', () => {
  const previousEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...previousEnv };
    jest.resetModules();
  });

  function loadConfiguration() {
    jest.resetModules();
    return require('./rabbitMQ').default;
  }

  it('rejects missing credentials when RabbitMQ is enabled in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.RABBITMQ_ENABLED = '1';
    delete process.env.RABBITMQ_USER_NAME;
    delete process.env.RABBITMQ_USER_PASSWORD;
    expect(loadConfiguration).toThrow(/Production RabbitMQ requires non-default/);
  });

  it('rejects default guest credentials in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.RABBITMQ_ENABLED = '1';
    process.env.RABBITMQ_USER_NAME = 'guest';
    process.env.RABBITMQ_USER_PASSWORD = 'guest';
    expect(loadConfiguration).toThrow(/Production RabbitMQ requires non-default/);
  });

  it('accepts explicitly configured non-default production credentials', () => {
    process.env.NODE_ENV = 'production';
    process.env.RABBITMQ_ENABLED = '1';
    process.env.RABBITMQ_USER_NAME = 'scanner-service';
    process.env.RABBITMQ_USER_PASSWORD = 'test-only-non-default-password';
    expect(loadConfiguration()).toMatchObject({
      username: 'scanner-service',
      password: 'test-only-non-default-password',
      enabled: true,
    });
  });

  it('does not require credentials when messaging is disabled', () => {
    process.env.NODE_ENV = 'production';
    process.env.RABBITMQ_ENABLED = '0';
    delete process.env.RABBITMQ_USER_NAME;
    delete process.env.RABBITMQ_USER_PASSWORD;
    expect(loadConfiguration().enabled).toBe(false);
  });

  it('preserves development defaults for local use', () => {
    process.env.NODE_ENV = 'development';
    process.env.RABBITMQ_ENABLED = '1';
    delete process.env.RABBITMQ_USER_NAME;
    delete process.env.RABBITMQ_USER_PASSWORD;
    expect(loadConfiguration()).toMatchObject({
      username: 'guest',
      password: 'guest',
      enabled: true,
    });
  });
});
