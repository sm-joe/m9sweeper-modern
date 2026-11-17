import {Injectable} from '@nestjs/common';
import {RabbitMQService} from './RabbitMQService';
import {MineLoggerService} from './mine-logger.service';

@Injectable()
export class MessagingService {

    constructor(
      private rabbitMQService: RabbitMQService,
      private readonly mineLoggerService: MineLoggerService
    ) {}

    async send(queueName: string, message: any): Promise<any> {
        this.mineLoggerService.log('Sending message to RabbitMQ....', MessagingService.name);
        try {
            const rChannel = await this.rabbitMQService.getChannel(queueName);
            if (rChannel) {
                // Scan jobs must survive RabbitMQ restarts; queue durability alone does not persist messages.
                return await rChannel.sendToQueue(queueName, message, {persistent: true});
            }
        } catch (e) {
            this.mineLoggerService.error({label: e.message, data: null}, e, MessagingService.name);
        }
        return null;
    }
}
