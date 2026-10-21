package request

import (
	"log/slog"
	"net/http"

	"github.com/example/app/backend/internal/platform/problem"
)

func Recover(log *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if v := recover(); v != nil {
					log.ErrorContext(r.Context(), "panic", slog.Any("panic", v), slog.String("request_id", ID(r.Context())))
					problem.Send(w, problem.Internal, ID(r.Context()))
				}
			}()
			next.ServeHTTP(w, r)
		})
	}
}
