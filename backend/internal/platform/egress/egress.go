package egress

import (
	"errors"
	"fmt"
	"net"
	"net/http"
	"regexp"
	"slices"
	"strings"
	"time"
)

var ErrHostNotAllowed = errors.New("egress: host not allowed")

type Client struct {
	http    *http.Client
	allowed []string
}

func New(allowed []string, timeout time.Duration) *Client {
	c := &Client{allowed: normalize(allowed)}
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil
	c.http = &http.Client{
		Timeout:   timeout,
		Transport: guard{next: transport, allow: c.allow},
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 3 {
				return errors.New("egress: too many redirects")
			}
			if req.URL.Hostname() != via[0].URL.Hostname() {
				return fmt.Errorf("%w: redirect to %s", ErrHostNotAllowed, req.URL.Hostname())
			}
			return nil
		},
	}
	return c
}

func (c *Client) Do(req *http.Request) (*http.Response, error) {
	return c.http.Do(req)
}

func (c *Client) allow(req *http.Request) error {
	if req.URL.Scheme != "https" {
		return fmt.Errorf("%w: scheme %s", ErrHostNotAllowed, req.URL.Scheme)
	}
	host := strings.ToLower(req.URL.Hostname())
	if net.ParseIP(host) != nil || !slices.Contains(c.allowed, host) {
		return fmt.Errorf("%w: %s", ErrHostNotAllowed, host)
	}
	return nil
}

type guard struct {
	next  http.RoundTripper
	allow func(*http.Request) error
}

func (g guard) RoundTrip(req *http.Request) (*http.Response, error) {
	if err := g.allow(req); err != nil {
		return nil, err
	}
	return g.next.RoundTrip(req)
}

func normalize(hosts []string) []string {
	out := make([]string, 0, len(hosts))
	for _, h := range hosts {
		if h = strings.ToLower(strings.TrimSpace(h)); h != "" {
			out = append(out, h)
		}
	}
	return out
}

type Redacted struct {
	text string
}

func (r Redacted) String() string {
	return r.text
}

var redactions = []struct {
	pattern *regexp.Regexp
	label   string
}{
	{regexp.MustCompile(`[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}`), "[EMAIL]"},
	{regexp.MustCompile(`\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,3})?\b`), "[IBAN]"},
	{regexp.MustCompile(`(?:\+|00)\d{1,3}[\s/-]?\d{2,5}(?:[\s/-]?\d{2,8}){1,3}|\b0\d{2,5}[\s/-]?\d{3,8}(?:[\s/-]?\d{2,6})?\b`), "[PHONE]"},
}

func Redact(s string) Redacted {
	for _, r := range redactions {
		s = r.pattern.ReplaceAllString(s, r.label)
	}
	return Redacted{text: s}
}
