#!/usr/bin/env bash
set -euo pipefail

install -d /opt/fastgpt/config
install -d /opt/fastgpt/logs
install -d /storage/docs
install -d /storage/images
install -d /storage/web
install -d /storage/videos
install -d /storage/derived
install -d /storage/tmp

echo "Created FastGPT directories."
