FROM golang:1.24-alpine AS builder
WORKDIR /app
RUN apk add --no-cache git ca-certificates tzdata build-base
COPY go_backend/go.mod go_backend/go.sum ./
RUN go mod download
COPY go_backend/ ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o /nexara-backend ./main.go

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata && adduser -D -h /app appuser
WORKDIR /app
COPY --from=builder /nexara-backend /app/nexara-backend
USER appuser
EXPOSE 7860
ENV PORT=7860
ENV GIN_MODE=release
CMD ["/app/nexara-backend"]
