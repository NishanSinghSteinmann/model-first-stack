-- name: GetNote :one
select id, owner_id, title, body, created_at from note where id = $1;

-- name: ListNote :many
select id, owner_id, title, body, created_at from note where id > sqlc.arg(after) order by id limit sqlc.arg(page_size);

-- name: CreateNote :one
insert into note (owner_id, title, body) values ($1, $2, $3) returning id, owner_id, title, body, created_at;

-- name: UpdateNote :one
update note set title = $2, body = $3 where id = $1 returning id, owner_id, title, body, created_at;
