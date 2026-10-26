import {
  DefaultNamingStrategy,
  NamingStrategyInterface,
  DataSourceOptions,
} from "typeorm";
import { camelCase, snakeCase } from "typeorm/util/StringUtils";
import { appConfig } from "@/config/app.config";

/**
 * Snake naming will be used in database operations
 */
export class SnakeNamingStrategy
  extends DefaultNamingStrategy
  implements NamingStrategyInterface
{
  tableName(className: string, customName: string): string {
    if (customName) return customName;
    const snakeCasedClassName = snakeCase(className);
    const splittedClassName = snakeCasedClassName.split("_");
    const lastWord = splittedClassName[splittedClassName.length - 1];
    switch (lastWord) {
      case "status":
        return `${snakeCasedClassName}es`;
      default:
        return `${snakeCasedClassName}s`;
    }
  }

  columnName(
    propertyName: string,
    customName: string,
    embeddedPrefixes: string[],
  ): string {
    return (
      snakeCase(embeddedPrefixes.join("_")) +
      (customName || snakeCase(propertyName))
    );
  }

  relationName(propertyName: string): string {
    return camelCase(propertyName, true);
  }

  joinColumnName(relationName: string, referencedColumnName: string): string {
    return snakeCase(`${relationName}_${referencedColumnName}`);
  }

  joinTableName(
    firstTableName: string,
    secondTableName: string,
    firstPropertyName: string,
  ): string {
    return snakeCase(
      `${firstTableName}_${firstPropertyName.replace(
        /\./gi,
        "_",
      )}_${secondTableName}`,
    );
  }

  joinTableColumnName(
    tableName: string,
    propertyName: string,
    columnName?: string,
  ): string {
    return snakeCase(`${tableName}_${columnName || propertyName}`);
  }

  classTableInheritanceParentColumnName(
    parentTableName: string,
    parentTableIdPropertyName: string,
  ): string {
    return snakeCase(`${parentTableName}_${parentTableIdPropertyName}`);
  }
}

// Running under ts-node/jest we load .ts sources; from `dist` we load compiled .js.
// Matching only one extension also keeps the emitted .d.ts files out of the globs.
const ext = __filename.endsWith(".ts") ? "ts" : "js";
const { env } = appConfig;

export const dataSourceOptions: DataSourceOptions = {
  type: "postgres",
  host: env.DB_HOST,
  port: env.DB_PORT,
  username: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_DATABASE,
  schema: "public",
  entities: [__dirname + `/../modules/**/entities/*.entity.${ext}`],
  namingStrategy: new SnakeNamingStrategy(),
  migrations: [__dirname + `/../database/migrations/*.${ext}`],
  logging: false,
  synchronize: false,
  // Bound acquisition and server work, including lock waits. Server-side cancellation
  // prevents a timed-out statement from silently committing after the client gives up.
  extra: {
    connectionTimeoutMillis: 1000,
    statement_timeout: 2000,
    query_timeout: 2200, // query + rollback remain below the five-second outage target
    idle_in_transaction_session_timeout: 5000,
  },
};

export default dataSourceOptions;
