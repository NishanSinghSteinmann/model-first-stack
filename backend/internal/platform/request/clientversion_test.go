package request

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestMinClientVersion(t *testing.T) {
	mins, err := ParseMinimums("ios=1.4.0, web=0.2.0")
	if err != nil {
		t.Fatal(err)
	}
	h := MinClientVersion(mins)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) }))
	for header, want := range map[string]int{
		"":           http.StatusNoContent,
		"ios/1.4.0":  http.StatusNoContent,
		"ios/1.10.0": http.StatusNoContent,
		"ios/1.3.9":  http.StatusUpgradeRequired,
		"ios/1.4":    http.StatusUpgradeRequired,
		"ios/x":      http.StatusUpgradeRequired,
		"web/0.1.0":  http.StatusUpgradeRequired,
		"partner/0":  http.StatusNoContent,
		"curl":       http.StatusNoContent,
	} {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		if header != "" {
			req.Header.Set(ClientVersionHeader, header)
		}
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != want {
			t.Errorf("%q = %d, want %d", header, rec.Code, want)
		}
	}
	if _, err := ParseMinimums("ios"); err == nil {
		t.Fatal("entry without version accepted")
	}
	if _, err := ParseMinimums("IOS=1.0.0"); err == nil {
		t.Fatal("client type outside the model accepted")
	}
}
