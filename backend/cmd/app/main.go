package main

import (
	"fmt"
	"os"

	"github.com/example/app/backend/internal/platform/app"
)

var version = "dev"

var modes = map[string]bool{"api": true, "worker": true, "drain": true, "migrate": true}

func main() {
	if len(os.Args) != 2 || !modes[os.Args[1]] {
		fmt.Fprintln(os.Stderr, "usage: app api|worker|drain|migrate")
		os.Exit(2)
	}
	app.Main(os.Args[1], version)
}
