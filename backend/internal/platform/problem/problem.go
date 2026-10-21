package problem

import (
	"encoding/json"
	"net/http"
)

type Body struct {
	Code      Code   `json:"code"`
	Message   string `json:"message"`
	RequestID string `json:"request_id,omitempty"`
}

func Status(c Code) int {
	if d, ok := defaults[c]; ok {
		return d.status
	}
	return http.StatusInternalServerError
}

func Message(c Code) string {
	return defaults[c].message
}

func Send(w http.ResponseWriter, c Code, requestID string) {
	write(w, c, Message(c), requestID)
}

func write(w http.ResponseWriter, c Code, message, requestID string) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(Status(c))
	_ = json.NewEncoder(w).Encode(Body{Code: c, Message: message, RequestID: requestID})
}
