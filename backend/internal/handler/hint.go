package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
)

type HintProxyHandler struct {
	aiServiceURL string
}

func NewHintProxyHandler(aiServiceURL string) *HintProxyHandler {
	return &HintProxyHandler{aiServiceURL: aiServiceURL}
}

func (h *HintProxyHandler) ProxyHint(c *gin.Context) {
	var body map[string]interface{}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	payload, _ := json.Marshal(body)
	resp, err := http.Post(fmt.Sprintf("%s/hint", h.aiServiceURL), "application/json", bytes.NewReader(payload))
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "AI service unavailable"})
		return
	}
	defer resp.Body.Close()

	data, _ := io.ReadAll(resp.Body)
	c.Data(resp.StatusCode, "application/json", data)
}
