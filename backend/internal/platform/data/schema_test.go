package data

import (
	"context"
	"encoding/json"
	"os"
	"slices"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
)

type snapshotColumn struct {
	Name     string `json:"name"`
	Type     string `json:"type"`
	Nullable bool   `json:"nullable"`
}

type snapshotTable struct {
	Name    string           `json:"name"`
	Columns []snapshotColumn `json:"columns"`
}

var udt = map[string]string{
	"uuid": "uuid", "text": "text", "bool": "bool", "int": "int4", "bigint": "int8",
	"timestamptz": "timestamptz", "date": "date", "jsonb": "jsonb", "bytea": "bytea",
	"text[]": "_text", "uuid[]": "_uuid",
}

func TestSchemaMatchesModel(t *testing.T) {
	ctx := context.Background()
	admin, _ := startPostgres(t)
	if err := Migrate(ctx, admin); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile("schema.gen.json")
	if err != nil {
		t.Fatal(err)
	}
	var snap struct {
		Tables []snapshotTable `json:"tables"`
	}
	if err := json.Unmarshal(raw, &snap); err != nil {
		t.Fatal(err)
	}
	conn, err := pgx.Connect(ctx, admin)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = conn.Close(ctx) }()

	rows, _ := conn.Query(ctx, `select c.relname, c.relrowsecurity, c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'goose_db_version' and c.relname not like 'river\_%'`)
	type rls struct{ enabled, forced bool }
	inDB := map[string]rls{}
	for rows.Next() {
		var name string
		var r rls
		if err := rows.Scan(&name, &r.enabled, &r.forced); err != nil {
			t.Fatal(err)
		}
		inDB[name] = r
	}
	if rows.Err() != nil {
		t.Fatal(rows.Err())
	}

	for _, table := range snap.Tables {
		r, ok := inDB[table.Name]
		if !ok {
			t.Errorf("%s: in the model, missing in migrations", table.Name)
			continue
		}
		delete(inDB, table.Name)
		if !r.enabled || !r.forced {
			t.Errorf("%s: RLS not enabled and forced", table.Name)
		}
		var got []string
		cols, _ := conn.Query(ctx, `select column_name, udt_name, is_nullable = 'YES' from information_schema.columns where table_schema = 'public' and table_name = $1`, table.Name)
		for cols.Next() {
			var name, typ string
			var null bool
			if err := cols.Scan(&name, &typ, &null); err != nil {
				t.Fatal(err)
			}
			got = append(got, name+" "+typ+" "+nullable(null))
		}
		if cols.Err() != nil {
			t.Fatal(cols.Err())
		}
		var want []string
		for _, c := range table.Columns {
			want = append(want, c.Name+" "+udt[c.Type]+" "+nullable(c.Nullable))
		}
		slices.Sort(got)
		slices.Sort(want)
		if !slices.Equal(got, want) {
			t.Errorf("%s: columns differ\n  model:     %s\n  database:  %s", table.Name, strings.Join(want, ", "), strings.Join(got, ", "))
		}
	}
	for name := range inDB {
		t.Errorf("%s: in migrations, missing in the model", name)
	}
}

func nullable(b bool) string {
	if b {
		return "null"
	}
	return "not null"
}
