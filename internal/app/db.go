package app

import (
	"database/sql"
	"fmt"
	"log/slog"
	"pulse/internal/config"

	_ "github.com/go-sql-driver/mysql"
	"github.com/stephenafamo/bob"
)

var DBConn *bob.DB

func InitDB() error {
	if config.DB == nil || !config.DB.Enabled {
		slog.Warn("Database is disabled in configuration")
		return nil
	}

	dsn := fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?parseTime=true",
		config.DB.User,
		config.DB.Pass,
		config.DB.Host,
		config.DB.Port,
		config.DB.Schema,
	)

	slog.Info("Connecting to database...", "host", config.DB.Host, "port", config.DB.Port, "schema", config.DB.Schema)
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return fmt.Errorf("failed to open mysql connection: %w", err)
	}

	// Simple connection check
	if err := db.Ping(); err != nil {
		return fmt.Errorf("failed to ping mysql database: %w", err)
	}

	bobDB := bob.NewDB(db)
	DBConn = &bobDB
	slog.Info("Successfully connected to MySQL database and initialized Bob DB wrapper")
	return nil
}
