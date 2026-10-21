package storage

import (
	"context"
	"errors"
	"fmt"
	"mime"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

const (
	UploadTTL   = 10 * time.Minute
	DownloadTTL = 5 * time.Minute
)

var ErrNotFound = errors.New("storage: object not found")

type Config struct {
	Endpoint  string
	PublicURL string
	Region    string
	Bucket    string
	AccessKey string
	SecretKey string
}

type Store struct {
	internal *minio.Client
	public   *minio.Client
	bucket   string
	now      func() time.Time
}

func New(cfg Config) (*Store, error) {
	if cfg.Bucket == "" || cfg.AccessKey == "" || cfg.SecretKey == "" {
		return nil, errors.New("storage: bucket and keys are required")
	}
	internal, err := client(cfg.Endpoint, cfg)
	if err != nil {
		return nil, err
	}
	public := internal
	if cfg.PublicURL != "" && cfg.PublicURL != cfg.Endpoint {
		if public, err = client(cfg.PublicURL, cfg); err != nil {
			return nil, err
		}
	}
	return &Store{internal: internal, public: public, bucket: cfg.Bucket, now: time.Now}, nil
}

func client(raw string, cfg Config) (*minio.Client, error) {
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" || (u.Scheme != "https" && u.Scheme != "http") {
		return nil, fmt.Errorf("storage: endpoint %q needs scheme and host", raw)
	}
	return minio.New(u.Host, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
		Secure: u.Scheme == "https",
		Region: cfg.Region,
	})
}

func (s *Store) PresignPut(ctx context.Context, key uuid.UUID, contentType string, size int64) (string, time.Time, error) {
	h := http.Header{}
	h.Set("Content-Type", contentType)
	h.Set("Content-Length", strconv.FormatInt(size, 10))
	u, err := s.public.PresignHeader(ctx, http.MethodPut, s.bucket, key.String(), UploadTTL, nil, h)
	if err != nil {
		return "", time.Time{}, err
	}
	return u.String(), s.now().Add(UploadTTL), nil
}

func (s *Store) PresignGet(ctx context.Context, key uuid.UUID, fileName string) (string, time.Time, error) {
	params := url.Values{}
	params.Set("response-content-disposition", mime.FormatMediaType("attachment", map[string]string{"filename": fileName}))
	u, err := s.public.PresignedGetObject(ctx, s.bucket, key.String(), DownloadTTL, params)
	if err != nil {
		return "", time.Time{}, err
	}
	return u.String(), s.now().Add(DownloadTTL), nil
}

func (s *Store) Size(ctx context.Context, key uuid.UUID) (int64, error) {
	info, err := s.internal.StatObject(ctx, s.bucket, key.String(), minio.StatObjectOptions{})
	if err != nil {
		if minio.ToErrorResponse(err).Code == minio.NoSuchKey {
			return 0, ErrNotFound
		}
		return 0, err
	}
	return info.Size, nil
}

func (s *Store) Ping(ctx context.Context) error {
	ok, err := s.internal.BucketExists(ctx, s.bucket)
	if err != nil {
		return err
	}
	if !ok {
		return errors.New("storage: bucket missing")
	}
	return nil
}
