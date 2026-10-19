# GitHub's Ubuntu runner, as the tests meet it: x86_64, Node and VS Code at CI's versions, Chrome stable, a screen (xvfb).
FROM --platform=linux/amd64 ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
	&& apt-get install -y --no-install-recommends ca-certificates curl git xvfb xauth xz-utils \
		fonts-dejavu-core fonts-liberation fonts-noto-color-emoji \
		libasound2t64 libgbm1 libgtk-3-0t64 libnss3 libsecret-1-0 libxkbfile1 libxss1 \
	&& curl -fsSL https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb -o /tmp/chrome.deb \
	&& apt-get install -y /tmp/chrome.deb \
	&& rm /tmp/chrome.deb \
	&& rm -rf /var/lib/apt/lists/*

ARG NODE_MAJOR
RUN file=$(curl -fsSL "https://nodejs.org/dist/latest-v${NODE_MAJOR}.x/SHASUMS256.txt" | grep -o 'node-v[0-9.]*-linux-x64.tar.xz' | head -1) \
	&& curl -fsSL "https://nodejs.org/dist/latest-v${NODE_MAJOR}.x/$file" | tar -xJ -C /usr/local --strip-components=1

ARG VSCODE_VERSION
RUN curl -fsSL "https://update.code.visualstudio.com/$VSCODE_VERSION/linux-x64/stable" | tar -xz -C /opt

# Not root, as on the runner: Chrome's sandbox is not a root's.
RUN useradd -m -u 1001 runner && mkdir -p /home/runner/.npm /work && chown runner /home/runner/.npm /work
USER runner
RUN git config --global --add safe.directory '*'
ENV CI=true CODE_BIN=/opt/VSCode-linux-x64/code
