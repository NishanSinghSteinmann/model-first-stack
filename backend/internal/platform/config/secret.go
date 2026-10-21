package config

import "log/slog"

type Secret struct {
	value string
}

const redacted = "[geheim]"

func NewSecret(v string) Secret               { return Secret{value: v} }
func (s Secret) Reveal() string               { return s.value }
func (s Secret) IsSet() bool                  { return s.value != "" }
func (s Secret) String() string               { return redacted }
func (s Secret) GoString() string             { return redacted }
func (s Secret) LogValue() slog.Value         { return slog.StringValue(redacted) }
func (s Secret) MarshalJSON() ([]byte, error) { return []byte(`"` + redacted + `"`), nil }
func (s Secret) MarshalText() ([]byte, error) { return []byte(redacted), nil }
