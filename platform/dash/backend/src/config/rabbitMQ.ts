// Production must never silently connect with RabbitMQ's well-known guest account.
// Keep development defaults for local integration, but fail closed before bootstrap
// if production credentials have not been provisioned.
const enabled = +(process.env.RABBITMQ_ENABLED || '1') === 1;
const username = process.env.RABBITMQ_USER_NAME;
const password = process.env.RABBITMQ_USER_PASSWORD;

if (process.env.NODE_ENV === 'production' && enabled &&
    (!username?.trim() || !password?.trim() ||
      username === 'guest' || password === 'guest')) {
  throw new Error('Production RabbitMQ requires non-default RABBITMQ_USER_NAME and RABBITMQ_USER_PASSWORD');
}

export default {
  hostname: process.env.RABBITMQ_HOST_NAME || 'rabbitmq',
  port: +process.env.RABBITMQ_HOST_PORT || 5672,
  protocol: process.env.RABBITMQ_PROTOCOL || 'amqp',
  username: username || 'guest',
  password: password || 'guest',
  vhost: process.env.RABBITMQ_VHOST || '/',
  frameMax: +process.env.RABBITMQ_FRAMEMAX || 0,
  enabled // default to enabled
};
