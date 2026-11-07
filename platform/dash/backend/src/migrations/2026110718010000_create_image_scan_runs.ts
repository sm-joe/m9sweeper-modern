import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('image_scan_runs', table => {
        table.uuid('id').primary();
        table.integer('cluster_id').notNullable().index();
        table.integer('image_id').notNullable().index();
        table.string('status', 24).notNullable().defaultTo('queued');
        table.boolean('compliant').nullable();
        table.text('failure_reason').nullable();
        table.bigInteger('created_at').notNullable();
        table.bigInteger('updated_at').notNullable();
        table.unique(['id', 'cluster_id', 'image_id']);
    });
    await knex.schema.alterTable('image_scan_results', table => {
        table.uuid('scan_run_id').nullable().index();
        table.unique(['scan_run_id', 'policy_id']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('image_scan_results', table => {
        table.dropUnique(['scan_run_id', 'policy_id']);
        table.dropColumn('scan_run_id');
    });
    await knex.schema.dropTableIfExists('image_scan_runs');
}
