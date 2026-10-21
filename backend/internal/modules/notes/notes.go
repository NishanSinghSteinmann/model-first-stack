package notes

import (
	"context"
	"net/http"

	"github.com/google/uuid"

	"github.com/example/app/backend/internal/api"
	"github.com/example/app/backend/internal/modules/notes/store"
	"github.com/example/app/backend/internal/platform/access"
	"github.com/example/app/backend/internal/platform/data"
	"github.com/example/app/backend/internal/platform/problem"
)

type Handlers struct {
	db *data.DB
}

func New(db *data.DB) *Handlers {
	return &Handlers{db: db}
}

func (h *Handlers) MeNotesList(ctx context.Context, req api.MeNotesListRequestObject) (api.MeNotesListResponseObject, error) {
	page, err := api.NewPage(req.Params.After, req.Params.Limit)
	if err != nil {
		return api.MeNotesListdefaultJSONResponse{StatusCode: http.StatusBadRequest, Body: fail(problem.InvalidRequest)}, nil
	}
	var rows []store.Note
	err = h.run(ctx, func(ctx context.Context, q *store.Queries) (err error) {
		rows, err = q.ListNote(ctx, store.ListNoteParams{After: page.After, PageSize: page.Limit})
		return err
	})
	if err != nil {
		return nil, err
	}
	items := make([]api.MeNotesListItem, 0, len(rows))
	for _, n := range rows {
		items = append(items, api.MeNotesListItem{Id: n.ID, Title: n.Title, Body: n.Body, CreatedAt: n.CreatedAt})
	}
	return api.MeNotesList200JSONResponse{Items: items, Next: api.Next(rows, page, func(n store.Note) uuid.UUID { return n.ID })}, nil
}

func (h *Handlers) MeNotesCreate(ctx context.Context, req api.MeNotesCreateRequestObject) (api.MeNotesCreateResponseObject, error) {
	var n store.Note
	err := h.run(ctx, func(ctx context.Context, q *store.Queries) (err error) {
		n, err = q.CreateNote(ctx, store.CreateNoteParams{OwnerID: owner(ctx), Title: req.Body.Title, Body: req.Body.Body})
		return err
	})
	if err != nil {
		return nil, err
	}
	return api.MeNotesCreate200JSONResponse{Id: n.ID, Title: n.Title, Body: n.Body, CreatedAt: n.CreatedAt}, nil
}

func (h *Handlers) MeNotesGet(ctx context.Context, req api.MeNotesGetRequestObject) (api.MeNotesGetResponseObject, error) {
	var n store.Note
	err := h.run(ctx, func(ctx context.Context, q *store.Queries) (err error) {
		n, err = q.GetNote(ctx, req.Note)
		return err
	})
	if data.IsNotFound(err) {
		return api.MeNotesGetdefaultJSONResponse{StatusCode: http.StatusNotFound, Body: fail(problem.NotFound)}, nil
	}
	if err != nil {
		return nil, err
	}
	return api.MeNotesGet200JSONResponse{Id: n.ID, Title: n.Title, Body: n.Body, CreatedAt: n.CreatedAt}, nil
}

func (h *Handlers) MeNotesUpdate(ctx context.Context, req api.MeNotesUpdateRequestObject) (api.MeNotesUpdateResponseObject, error) {
	var n store.Note
	err := h.run(ctx, func(ctx context.Context, q *store.Queries) (err error) {
		if n, err = q.GetNote(ctx, req.Note); err != nil {
			return err
		}
		if req.Body.Title != nil {
			n.Title = *req.Body.Title
		}
		if req.Body.Body != nil {
			n.Body = *req.Body.Body
		}
		n, err = q.UpdateNote(ctx, store.UpdateNoteParams{ID: n.ID, Title: n.Title, Body: n.Body})
		return err
	})
	if data.IsNotFound(err) {
		return api.MeNotesUpdatedefaultJSONResponse{StatusCode: http.StatusNotFound, Body: fail(problem.NotFound)}, nil
	}
	if err != nil {
		return nil, err
	}
	return api.MeNotesUpdate200JSONResponse{Id: n.ID, Title: n.Title, Body: n.Body, CreatedAt: n.CreatedAt}, nil
}

func (h *Handlers) run(ctx context.Context, fn func(context.Context, *store.Queries) error) error {
	scope, _ := access.FromContext(ctx)
	return data.Do(ctx, h.db, scope, store.New, fn)
}

func owner(ctx context.Context) uuid.UUID {
	scope, _ := access.FromContext(ctx)
	return uuid.MustParse(scope.Principal().ID)
}

func fail(c problem.Code) api.Problem {
	return api.Problem{Code: string(c), Message: problem.Message(c)}
}
