package models

import "time"

type BinanceTickerRaw struct {
	EventType        string  `json:"e"`
	EventTime        float64 `json:"E"`
	Symbol           string  `json:"s"`
	Price            string  `json:"p"`
	PriceChange      string  `json:"P"`
	WeightAvgPrice   string  `json:"w"`
	FirstTradePrice  string  `json:"x"`
	LastPrice        string  `json:"c"`
	LastQty          string  `json:"Q"`
	BestBidPrice     string  `json:"b"`
	BestBidQty       string  `json:"B"`
	BestAskPrice     string  `json:"a"`
	BestAskQty       string  `json:"A"`
	OpenPrice        string  `json:"o"`
	HighPrice        string  `json:"h"`
	LowPrice         string  `json:"l"`
	TotalTradeVolume string  `json:"v"`
	TotalTradeCount  string  `json:"q"`
	OpenTime         float64 `json:"O"`
	CloseTime        float64 `json:"C"`
	FirstTradeID     float64 `json:"F"`
	LastTradeID      float64 `json:"L"`
	TradeCount       float64 `json:"n"`
}

type BinanceDataResult struct {
	Symbol       string
	Price        string
	AggregateID  int64
	FirstTradeID int64
	LastTradeID  int64
	TradeTime    int64
}

type PriceRange string

const (
	Above PriceRange = "ABOVE"
	Below PriceRange = "BELOW"
)

type AlertsRequestRaw struct {
	ID               string     `json:"id,omitempty"`
	Requester        string     `json:"requester,omitempty"`
	Symbol           string     `json:"symbol,omitempty"`
	Price            string     `json:"price,omitempty"`
	Status           string     `json:"status,omitempty"`
	Range            PriceRange `json:"range,omitempty"`
	TriggerDirection string     `json:"trigger_direction,omitempty"`
	ShowAll          bool       `json:"show_all,omitempty"`
	AppOrigin        string     `json:"app_origin,omitempty"`
}

type Alert struct {
	ID                 int        `db:"id" json:"id"`
	Requester          string     `db:"requester" json:"requester"`
	Symbol             string     `db:"symbol" json:"symbol"`
	PriceTrigger       float64    `db:"price_trigger" json:"price_trigger"`
	NotificationStatus string     `db:"notification_status" json:"notification_status"` // "PENDING", "TRIGGERED", "CANCELLED", "FAILED"
	LatestPrice        float64    `db:"latest_price" json:"latest_price"`
	TriggerDirection   string     `db:"trigger_direction" json:"trigger_direction"` // "ABOVE", "BELOW"
	ErrorMessage       *string    `db:"error_message" json:"error_message,omitempty"`
	CreatedAt          time.Time  `db:"created_at" json:"created_at"`
	UpdatedAt          time.Time  `db:"updated_at" json:"updated_at"`
	TriggeredAt        *time.Time `db:"triggered_at" json:"triggered_at,omitempty"`
	ActiveRequester    string     `db:"active_requester" json:"active_requester,omitempty"`
	AppOrigin          string     `db:"app_origin" json:"app_origin,omitempty"`
}

type AlertsKafkaPayload struct {
	EventType   string            `json:"event_type"`
	TargetTopic *string           `json:"target_topic,omitempty"`
	TargetEmail string            `json:"target_email,omitempty"`
	Data        map[string]string `json:"data,omitempty"`
}

type FCMSubscribeRequest struct {
	Token string `json:"token" binding:"required"`
	Email string `json:"email" binding:"required"`
}
