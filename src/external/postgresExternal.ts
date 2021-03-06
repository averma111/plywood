module Plywood {
  interface SQLDescribeRow {
    name: string;
    sqlType: string;
  }

  function postProcessIntrospect(columns: SQLDescribeRow[]): Attributes {
    return columns.map((column: SQLDescribeRow) => {
      var name = column.name;
      var sqlType = column.sqlType.toLowerCase();
      if (sqlType.indexOf('timestamp') !== -1) {
        return new AttributeInfo({ name, type: 'TIME' });
      } else if (sqlType === 'character varying') {
        return new AttributeInfo({ name, type: 'STRING' });
      } else if (sqlType === 'integer' || sqlType === 'bigint') {
        // ToDo: make something special for integers
        return new AttributeInfo({ name, type: 'NUMBER' });
      } else if (sqlType === "double precision" || sqlType === "float") {
        return new AttributeInfo({ name, type: 'NUMBER' });
      } else if (sqlType === 'boolean') {
        return new AttributeInfo({ name, type: 'BOOLEAN' });
      }
      return null;
    }).filter(Boolean);
  }

  export class PostgresExternal extends SQLExternal {
    static type = 'DATASET';

    static fromJS(parameters: ExternalJS, requester: Requester.PlywoodRequester<any>): PostgresExternal {
      var value: ExternalValue = External.jsToValue(parameters, requester);
      return new PostgresExternal(value);
    }

    static getSourceList(requester: Requester.PlywoodRequester<any>): Q.Promise<string[]> {
      return requester({
        query: `SELECT table_name AS "tab" FROM INFORMATION_SCHEMA.TABLES WHERE table_type = 'BASE TABLE' AND table_schema = 'public'`
      })
        .then((sources) => {
          if (!Array.isArray(sources)) throw new Error('invalid sources response');
          if (!sources.length) return sources;
          return sources.map((s: PseudoDatum) => s['tab']).sort();
        });
    }

    static getVersion(requester: Requester.PlywoodRequester<any>): Q.Promise<string> {
      return requester({ query: 'SELECT version()' })
        .then((res) => {
          if (!Array.isArray(res) || res.length !== 1) throw new Error('invalid version response');
          var key = Object.keys(res[0])[0];
          if (!key) throw new Error('invalid version response (no key)');
          var versionString = res[0][key];
          var match: string[];
          if (match = versionString.match(/^PostgreSQL (\S+) on/)) versionString = match[1];
          return versionString;
        });
    }

    constructor(parameters: ExternalValue) {
      super(parameters, new PostgresDialect());
      this._ensureEngine("postgres");
    }

    protected getIntrospectAttributes(): Q.Promise<Attributes> {
      return this.requester({
        query: `SELECT "column_name" AS "name", "data_type" AS "sqlType" FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name = ${this.dialect.escapeLiteral(this.source as string)}`,
      }).then(postProcessIntrospect);
    }
  }

  External.register(PostgresExternal, 'postgres');
}
