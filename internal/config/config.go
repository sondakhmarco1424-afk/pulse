package config

import (
	"log/slog"

	"github.com/gookit/config/v2"
	"github.com/gookit/config/v2/yaml"
)

var App *app
var Server *server
var Sentry *sentry
var DB *db
var Redis *redis
var Binance *binance
var Firebase *firebase
var Kafka *kafkaConfig

type app struct {
	Env                 string `yaml:"env"`
	Version             string `yaml:"version"`
	EnableAuth          bool   `yaml:"enable_auth"`
	RetriesCount        int    `yaml:"retries_count"`
	PICTypes            string `yaml:"pic_types"`
	Timezone            string `yaml:"timezone"`
	TimeFormat          string `yaml:"timeformat"`
	ServiceName         string `yaml:"service_name"`
	StartProcessingDate string `yaml:"start_processing_date"`
	GoLiveDate          string `yaml:"go_live_date"`
}

type server struct {
	Host          string `yaml:"host"`
	Port          int    `yaml:"port"`
	BasePath      string `yaml:"base_path"`
	SwaggerPath   string `yaml:"swagger_path"`
	SwaggerScheme string `yaml:"swagger_scheme"`
}

type sentry struct {
	Enabled bool   `yaml:"enabled"`
	DSN     string `yaml:"dsn"`
}

type db struct {
	Enabled bool   `yaml:"enabled"`
	Host    string `yaml:"host"`
	Port    int    `yaml:"port"`
	User    string `yaml:"user"`
	Pass    string `yaml:"pass"`
	Schema  string `yaml:"schema"`
}

type redis struct {
	Host                string `yaml:"host"`
	Port                int    `yaml:"port"`
	Password            string `yaml:"password,omitempty"`
	Expiry              int    `yaml:"expiry"`
	DB                  int    `yaml:"db"`
	MaxRetries          int    `yaml:"max_retries"`
	DialTimeoutSeconds  int    `yaml:"dial_timeout_seconds"`
	ReadTimeoutSeconds  int    `yaml:"read_timeout_seconds"`
	WriteTimeoutSeconds int    `yaml:"write_timeout_seconds"`
	PoolTimeoutSeconds  int    `yaml:"pool_timeout_seconds"`
	ReconnectMinSeconds int    `yaml:"reconnect_min_seconds"`
	ReconnectMaxSeconds int    `yaml:"reconnect_max_seconds"`
}

type binance struct {
	WsUrl                 string `yaml:"ws_url"`
	ReconnectDelaySeconds int    `yaml:"reconnect_delay_seconds"`
}

type firebase struct {
	ServiceAccountKey string `yaml:"service_account_key"`
	Enabled           bool   `yaml:"enabled"`
}

type kafkaConfig struct {
	Brokers               []string `yaml:"brokers"`
	FCMNotificationsTopic string   `yaml:"fcm_notifications_topic"`
}

func Setup(config_file string) {
	// A block to ensure the config file only be loaded once
	if App == nil {
		// config.ParseEnv: will parse env var in string value. eg: shell: ${SHELL}
		config.WithOptions(config.ParseEnv)
		config.WithOptions(func(opt *config.Options) {
			opt.DecoderConfig.TagName = "yaml"
		})
		// add driver for support yaml content
		config.AddDriver(yaml.Driver)
	}

	err := config.LoadFiles(config_file)
	if err != nil {
		panic(err)
	}

	errormsg := "Issue loading config: "

	capp := app{}
	err = config.BindStruct("app", &capp)
	if err != nil {
		slog.Error(errormsg + err.Error())
		panic(err)
	}
	App = &capp

	cserver := server{}
	err = config.BindStruct("server", &cserver)
	if err != nil {
		slog.Error(errormsg + err.Error())
		panic(err)
	}
	Server = &cserver

	// Sentry block is optional
	if config.Exists("sentry") {
		csentry := sentry{}
		err = config.BindStruct("sentry", &csentry)
		if err != nil {
			slog.Error(errormsg + err.Error())
			panic(err)
		}
		Sentry = &csentry
	}

	cdb := db{}
	err = config.BindStruct("db.mysql", &cdb)
	if err != nil {
		slog.Error(errormsg + err.Error())
		panic(err)
	}
	DB = &cdb

	credis := redis{}
	err = config.BindStruct("redis", &credis)
	if err != nil {
		slog.Error(errormsg + err.Error())
		panic(err)
	}
	Redis = &credis

	cbinance := binance{}
	err = config.BindStruct("binance", &cbinance)
	if err != nil {
		slog.Error(errormsg + err.Error())
		panic(err)
	}
	Binance = &cbinance

	cfirebase := firebase{}
	err = config.BindStruct("firebase", &cfirebase)
	if err != nil {
		slog.Error(errormsg + err.Error())
		panic(err)
	}
	Firebase = &cfirebase

	ckafka := kafkaConfig{}
	err = config.BindStruct("kafka", &ckafka)
	if err != nil {
		slog.Error(errormsg + err.Error())
		panic(err)
	}
	Kafka = &ckafka
}
