import {Knex} from 'knex';

/** Explicit per-cluster grants. Global authorities remain the upper bound. */
export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('cluster_user_access', table => {
        table.integer('cluster_id').notNullable();
        table.integer('user_id').notNullable();
        table.boolean('can_write').notNullable().defaultTo(false);
        table.bigInteger('created_at').notNullable();
        table.primary(['cluster_id', 'user_id']);
        table.index(['user_id', 'cluster_id']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('cluster_user_access');
}
