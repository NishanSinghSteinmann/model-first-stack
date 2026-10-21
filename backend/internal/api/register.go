package api

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/getkin/kin-openapi/openapi3filter"
	middleware "github.com/oapi-codegen/nethttp-middleware"

	"github.com/example/app/backend/internal/platform/access"
	"github.com/example/app/backend/internal/platform/problem"
	"github.com/example/app/backend/internal/platform/request"
)

func Register(r *access.Router, h Handlers, log *slog.Logger) error {
	if missing := h.missing(); len(missing) > 0 {
		return fmt.Errorf("api: handlers missing for modules %v", missing)
	}
	spec, err := GetSpec()
	if err != nil {
		return err
	}
	validate := middleware.OapiRequestValidatorWithOptions(spec, &middleware.Options{
		Options:               openapi3filter.Options{AuthenticationFunc: openapi3filter.NoopAuthenticationFunc, MultiError: false},
		SilenceServersWarning: true,
		ErrorHandlerWithOpts: func(ctx context.Context, _ error, w http.ResponseWriter, _ *http.Request, _ middleware.ErrorHandlerOpts) {
			problem.Send(w, problem.InvalidRequest, request.ID(ctx))
		},
	})
	fail := func(code problem.Code) func(http.ResponseWriter, *http.Request, error) {
		return func(w http.ResponseWriter, req *http.Request, _ error) {
			problem.Send(w, code, request.ID(req.Context()))
		}
	}
	b := r.Bind(Rules, validate)
	HandlerWithOptions(NewStrictHandlerWithOptions(h, nil, StrictHTTPServerOptions{
		RequestErrorHandlerFunc: fail(problem.InvalidRequest),
		ResponseErrorHandlerFunc: func(w http.ResponseWriter, req *http.Request, err error) {
			log.ErrorContext(req.Context(), "handler failed", slog.String("request_id", request.ID(req.Context())), slog.Any("error", err))
			problem.Send(w, problem.Internal, request.ID(req.Context()))
		},
	}), StdHTTPServerOptions{BaseRouter: b, ErrorHandlerFunc: fail(problem.InvalidRequest)})
	if err := b.Complete(); err != nil {
		return errors.Join(errors.New("api: model and handlers differ"), err)
	}
	return nil
}
