package request

import (
	"fmt"
	"net/http"
	"slices"
	"strconv"
	"strings"

	"github.com/example/app/backend/internal/platform/problem"
)

const ClientVersionHeader = "X-Client-Version"

type Version [3]int

func ParseVersion(s string) (Version, error) {
	var v Version
	parts := strings.Split(s, ".")
	if len(parts) != 3 {
		return v, fmt.Errorf("version %q needs major.minor.patch", s)
	}
	for i, p := range parts {
		n, err := strconv.Atoi(p)
		if err != nil || n < 0 || n > 9999 {
			return v, fmt.Errorf("version %q is not numeric", s)
		}
		v[i] = n
	}
	return v, nil
}

func (v Version) Less(o Version) bool {
	for i := range v {
		if v[i] != o[i] {
			return v[i] < o[i]
		}
	}
	return false
}

func ParseMinimums(raw string) (map[string]Version, error) {
	out := map[string]Version{}
	for _, entry := range strings.Split(raw, ",") {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}
		platform, version, ok := strings.Cut(entry, "=")
		if !ok || platform == "" {
			return nil, fmt.Errorf("client minimum %q needs platform=version", entry)
		}
		if !slices.Contains(ClientTypes, platform) {
			return nil, fmt.Errorf("client type %q is not in the model, known: %v", platform, ClientTypes)
		}
		v, err := ParseVersion(version)
		if err != nil {
			return nil, err
		}
		out[platform] = v
	}
	return out, nil
}

func MinClientVersion(minimums map[string]Version) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			platform, raw, ok := strings.Cut(r.Header.Get(ClientVersionHeader), "/")
			if minimum, known := minimums[platform]; ok && known {
				v, err := ParseVersion(raw)
				if err != nil || v.Less(minimum) {
					problem.Send(w, problem.ClientOutdated, ID(r.Context()))
					return
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}
