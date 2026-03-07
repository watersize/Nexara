FROM golang:1.24-alpine AS builder
WORKDIR /app
RUN apk add --no-cache git ca-certificates
COPY go_backend/go.mod go_backend/go.sum* ./
RUN go mod download
COPY go_backend/main.go ./main.go
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o /nexara-backend ./main.go

FROM alpine:3.20
RUN apk add --no-cache ca-certificates && adduser -D -h /app appuser
WORKDIR /app
COPY --from=builder /nexara-backend /app/nexara-backend
USER appuser
EXPOSE 7860
ENV PORT=7860
CMD ["/app/nexara-backend"]
