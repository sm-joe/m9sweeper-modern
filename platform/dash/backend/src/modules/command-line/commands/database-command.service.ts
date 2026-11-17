import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../shared/services/database.service';
import { MineLoggerService } from '../../shared/services/mine-logger.service';

/**
 * This command is used mainly by init containers and stuff to verify database connectivity before attempting to start pods to helm with errors
 */
@Injectable()
export class DatabaseCommand {
    // Create the constructor so that we can utilize the DatabaseService for this command
    constructor(
      private readonly databaseService: DatabaseService,
      protected readonly logger: MineLoggerService
    ) {}

    /**
     * Run a check against the defined database to ensure it is responding to queries.
     * @returns true if the connection was successful, false if it failed for any reason.
     */
    async runCheck(): Promise<boolean> {
        try {
            // Create a connection to the database
            const connection = await this.databaseService.getConnection();

            // Exectue a simple statement against the database to verify it is responding to queries
            await connection.raw("SELECT 1");

            // Display that the database is online and responding
            console.log("Database is online and responding to queries");

            // Return that the command completed successfully
            return true;
        } catch (error) {
            // Log out any error we get
            console.error(`Unable to connect to the database: ${error.message}`);

            // Return that the command did not complete successfully
            return false;
        }
    }

    /**
     * Waits for the defined database to ensure it is responding to queries.
     * @returns true once the database is online and responding to queries.
     */
    async waitForDatabase(): Promise<boolean> {
        const maxAttempts = 30;
        const retryDelayMs = 2000;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const connection = await this.databaseService.getConnection();
                await connection.raw("SELECT 1");
                console.log("Database is online and responding to queries");
                return true;
            } catch (error) {
                // Authentication, authorization and missing-database errors cannot
                // be fixed by waiting for the server to become ready.
                const code = String(error?.code || "");
                if (["28P01", "28000", "3D000", "42501"].includes(code)) {
                    console.error(
                        `Database startup blocked by configuration or access error (SQLSTATE ${code}). ` +
                        "Check the configured database, role and Secret against the existing PostgreSQL volume."
                    );
                    return false;
                }
                if (attempt === maxAttempts) {
                    console.error(`Database did not become ready after ${maxAttempts} attempts. ` +
                        "Check PostgreSQL availability and service connectivity.");
                    return false;
                }
                console.error(`Database connection unavailable; retry ${attempt}/${maxAttempts} in 2 seconds.`);
                await new Promise(resolve => setTimeout(resolve, retryDelayMs));
            }
        }
        return false;
    }

    async runMigrations(): Promise<boolean> {
        try {
            this.logger.log({label: 'Running Migrations'}, 'DatabaseCommand.runMigrations');
            await this.databaseService.runMigration();
        } catch(e) {
            this.logger.error({label: 'Error running migrations'}, e, 'DatabaseCommand.runMigrations');
            return false;
        }
        this.logger.log({label: 'Migrations Complete.'}, 'DatabaseCommand.runMigrations');
        return true;
    }
}