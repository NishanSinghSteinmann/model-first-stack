package storage

import (
	"context"
	"errors"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"
)

const s3Config = `{"identities":[{"name":"local","credentials":[{"accessKey":"local","secretKey":"local-secret"}],"actions":["Admin","Read","Write","List"]}]}`

func start(t *testing.T) *Store {
	t.Helper()
	ctx := context.Background()
	c, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: testcontainers.ContainerRequest{
			Image:        "chrislusf/seaweedfs:4.47",
			Cmd:          []string{"server", "-dir=/data", "-s3", "-s3.port=8333", "-s3.config=/etc/s3.json"},
			ExposedPorts: []string{"8333/tcp"},
			Files:        []testcontainers.ContainerFile{{Reader: strings.NewReader(s3Config), ContainerFilePath: "/etc/s3.json", FileMode: 0o644}},
			WaitingFor:   wait.ForListeningPort("8333/tcp").WithStartupTimeout(time.Minute),
		},
		Started: true,
	})
	if err != nil {
		if os.Getenv("CI") != "" || !strings.Contains(err.Error(), "Cannot connect to the Docker daemon") {
			t.Fatalf("s3 container: %v", err)
		}
		t.Skipf("docker not available: %v", err)
	}
	t.Cleanup(func() { _ = c.Terminate(context.Background()) })
	host, err := c.PortEndpoint(ctx, "8333/tcp", "")
	if err != nil {
		t.Fatal(err)
	}
	admin, err := minio.New(host, &minio.Options{Creds: credentials.NewStaticV4("local", "local-secret", ""), Region: "us-east-1"})
	if err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(30 * time.Second)
	for {
		err = admin.MakeBucket(ctx, "files", minio.MakeBucketOptions{Region: "us-east-1"})
		if err == nil || time.Now().After(deadline) {
			break
		}
		time.Sleep(500 * time.Millisecond)
	}
	if err != nil {
		t.Fatal(err)
	}
	s, err := New(Config{Endpoint: "http://" + host, Region: "us-east-1", Bucket: "files", AccessKey: "local", SecretKey: "local-secret"})
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func put(t *testing.T, url, contentType, body string) int {
	t.Helper()
	req, err := http.NewRequestWithContext(context.Background(), http.MethodPut, url, strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", contentType)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = res.Body.Close() }()
	return res.StatusCode
}

func TestUploadOnlyWithSignedTypeAndSize(t *testing.T) {
	ctx := context.Background()
	s := start(t)
	if err := s.Ping(ctx); err != nil {
		t.Fatal(err)
	}
	key := uuid.New()
	body := "%PDF-1.7 hallo"
	url, _, err := s.PresignPut(ctx, key, "application/pdf", int64(len(body)))
	if err != nil {
		t.Fatal(err)
	}
	if code := put(t, url, "text/html", body); code != http.StatusForbidden {
		t.Fatalf("other content type = %d", code)
	}
	if code := put(t, url, "application/pdf", body+" mehr"); code != http.StatusForbidden {
		t.Fatalf("other size = %d", code)
	}
	if _, err := s.Size(ctx, key); !errors.Is(err, ErrNotFound) {
		t.Fatalf("size before upload = %v", err)
	}
	if code := put(t, url, "application/pdf", body); code != http.StatusOK {
		t.Fatalf("signed upload = %d", code)
	}
	if size, err := s.Size(ctx, key); err != nil || size != int64(len(body)) {
		t.Fatalf("size = %d %v", size, err)
	}
	get, _, err := s.PresignGet(ctx, key, "Invoice März.pdf")
	if err != nil {
		t.Fatal(err)
	}
	res, err := http.Get(get)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = res.Body.Close() }()
	got, _ := io.ReadAll(res.Body)
	if string(got) != body || !strings.Contains(res.Header.Get("Content-Disposition"), "attachment") {
		t.Fatalf("download = %q %q", got, res.Header.Get("Content-Disposition"))
	}
}
