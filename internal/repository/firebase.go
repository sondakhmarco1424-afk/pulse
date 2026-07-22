package repository

import (
	"context"
	"fmt"
	"os"
	"strings"
	"sync"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/messaging"
	"google.golang.org/api/option"

	"pulse/internal/config"
)

type (
	FirebaseRepository interface {
		Init(credFile string) error
		MessagingClient(ctx context.Context) (*messaging.Client, error)
	}

	firebaseRepository struct {
		app             *firebase.App
		messagingClient *messaging.Client
		credFile        string
	}
)

var (
	firebaseRepositoryLock     = &sync.Mutex{}
	firebaseRepositoryInstance *firebaseRepository
)

func NewFirebaseRepository() FirebaseRepository {
	repo := GetFirebaseRepositoryInstance()

	firebaseRepositoryLock.Lock()
	repo.refreshSharedDependencies()
	firebaseRepositoryLock.Unlock()

	return repo
}

func GetFirebaseRepositoryInstance() *firebaseRepository {
	if firebaseRepositoryInstance == nil {
		firebaseRepositoryLock.Lock()
		defer firebaseRepositoryLock.Unlock()
		if firebaseRepositoryInstance == nil {
			credFile := ""
			if config.Firebase != nil {
				credFile = config.Firebase.ServiceAccountKey
			}
			firebaseRepositoryInstance = &firebaseRepository{
				credFile: credFile,
			}
		}
	}

	return firebaseRepositoryInstance
}

func (repo *firebaseRepository) refreshSharedDependencies() {
	if repo.credFile == "" && config.Firebase != nil {
		repo.credFile = config.Firebase.ServiceAccountKey
	}
}

func (repo *firebaseRepository) Init(credFile string) error {
	firebaseRepositoryLock.Lock()
	defer firebaseRepositoryLock.Unlock()

	if repo.messagingClient != nil {
		return nil
	}

	resolvedCredFile, err := repo.resolveServiceAccountKey(credFile)
	if err != nil {
		return err
	}

	var opts []option.ClientOption
	if resolvedCredFile != "" {
		opts = append(opts, option.WithCredentialsFile(resolvedCredFile))
		repo.credFile = resolvedCredFile
	}

	ctx := context.Background()
	app, err := firebase.NewApp(ctx, nil, opts...)
	if err != nil {
		return err
	}

	client, err := app.Messaging(ctx)
	if err != nil {
		return err
	}

	repo.app = app
	repo.messagingClient = client
	return nil
}

func (repo *firebaseRepository) MessagingClient(ctx context.Context) (*messaging.Client, error) {
	if repo.messagingClient != nil {
		return repo.messagingClient, nil
	}

	if err := repo.Init(""); err != nil {
		return nil, err
	}

	return repo.messagingClient, nil
}

func (repo *firebaseRepository) resolveServiceAccountKey(credFile string) (string, error) {
	candidates := make([]string, 0, 5)
	candidates = append(candidates, strings.TrimSpace(credFile))
	candidates = append(candidates, strings.TrimSpace(repo.credFile))
	candidates = append(candidates, strings.TrimSpace(os.Getenv("FIREBASE_SERVICE_ACCOUNT_KEY")))
	candidates = append(candidates,
		"internal/config/firebase-service-account.json",
		"./internal/config/firebase-service-account.json",
		"../internal/config/firebase-service-account.json",
		"/secrets/firebase_service_account_key.json",
		"/secrets/firebase/gcp.json",
		"./docker/google-cloud/firebase/gcp.json",
	)

	seen := make(map[string]struct{}, len(candidates))
	var configuredPath string
	for _, candidate := range candidates {
		if candidate == "" {
			continue
		}
		if _, exists := seen[candidate]; exists {
			continue
		}
		seen[candidate] = struct{}{}
		if configuredPath == "" {
			configuredPath = candidate
		}

		if _, err := os.Stat(candidate); err == nil {
			return candidate, nil
		}
	}

	if configuredPath != "" {
		return "", fmt.Errorf("firebase service account key file not found: %s", configuredPath)
	}

	return "", nil
}
