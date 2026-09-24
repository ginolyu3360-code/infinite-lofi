#!/usr/bin/env bash
set -euo pipefail

# Usage: bash scripts/build-ffmpeg-macos.sh arm64|x64
# Requires the Apple command-line tools and pkg-config. Downloads happen at build time only.
arch="${1:-}"
case "$arch" in
  arm64)
    compiler_arch=arm64
    ffmpeg_arch=aarch64
    host=aarch64-apple-darwin
    asm_option=--disable-asm
    cross_options=()
    ;;
  x64)
    compiler_arch=x86_64
    ffmpeg_arch=x86_64
    host=x86_64-apple-darwin
    asm_option=--disable-x86asm
    cross_options=(--enable-cross-compile)
    ;;
  *)
    echo "Usage: $0 arm64|x64" >&2
    exit 2
    ;;
esac

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
build_root="$(mktemp -d)"
prefix="$build_root/prefix"
mkdir -p "$prefix" "$build_root/opus-build" "$build_root/vpx-build" "$build_root/ffmpeg-build" "$project_root/out/ffmpeg-macos-$arch"

download_source() {
  local url="$1" archive="$2" expected="$3" actual
  curl --fail --location --silent --show-error --output "$build_root/$archive" "$url"
  actual="$(shasum -a 256 "$build_root/$archive" | awk '{print $1}')"
  if [[ "$actual" != "$expected" ]]; then
    echo "Source hash mismatch: $archive" >&2
    exit 1
  fi
}

download_source "https://ffmpeg.org/releases/ffmpeg-7.1.tar.xz" "ffmpeg-7.1.tar.xz" "40973d44970dbc83ef302b0609f2e74982be2d85916dd2ee7472d30678a7abe6"
download_source "https://github.com/webmproject/libvpx/archive/refs/tags/v1.16.0.tar.gz" "libvpx-v1.16.0.tar.gz" "7a479a3c66b9f5d5542a4c6a1b7d3768a983b1e5c14c60a9396edc9b649e015c"
download_source "https://downloads.xiph.org/releases/opus/opus-1.5.2.tar.gz" "opus-1.5.2.tar.gz" "65c1d2f78b9f2fb20082c38cbe47c951ad5839345876e46941612ee87f9a7ce1"
tar -xf "$build_root/ffmpeg-7.1.tar.xz" -C "$build_root"
tar -xzf "$build_root/libvpx-v1.16.0.tar.gz" -C "$build_root"
tar -xzf "$build_root/opus-1.5.2.tar.gz" -C "$build_root"

(
  cd "$build_root/opus-build"
  "$build_root/opus-1.5.2/configure" --host="$host" --prefix="$prefix" --disable-shared --enable-static --disable-extra-programs \
    CC="clang -arch $compiler_arch" CFLAGS="-O2 -arch $compiler_arch -mmacosx-version-min=11.0"
  make -j4 install
)
(
  cd "$build_root/vpx-build"
  CC="clang -arch $compiler_arch" CXX="clang++ -arch $compiler_arch" LD="clang++ -arch $compiler_arch" \
    "$build_root/libvpx-1.16.0/configure" --target=generic-gnu --prefix="$prefix" --disable-shared --enable-static \
    --disable-examples --disable-tools --disable-docs --disable-unit-tests --disable-vp9 \
    --extra-cflags=-mmacosx-version-min=11.0
  make -j4 install
)
(
  cd "$build_root/ffmpeg-build"
  PKG_CONFIG_PATH="$prefix/lib/pkgconfig" PKG_CONFIG_LIBDIR="$prefix/lib/pkgconfig" "$build_root/ffmpeg-7.1/configure" \
    --prefix="$prefix" --arch="$ffmpeg_arch" --target-os=darwin --cc="clang -arch $compiler_arch" \
    --extra-cflags="-arch $compiler_arch -mmacosx-version-min=11.0" \
    --extra-ldflags="-arch $compiler_arch -mmacosx-version-min=11.0" \
    --pkg-config-flags=--static --disable-gpl --disable-nonfree --disable-version3 \
    --disable-autodetect "$asm_option" --disable-doc --disable-ffplay --disable-ffprobe \
    --disable-debug --enable-small --enable-libvpx --enable-libopus \
    "${cross_options[@]}"
  make -j4 ffmpeg
)

binary="$build_root/ffmpeg-build/ffmpeg"
"$binary" -version
for extension in avi mkv; do
  "$binary" -hide_banner -nostdin -y -i "$project_root/test/fixtures/local-video.$extension" \
    -map 0:v:0 -map '0:a:0?' -sn -dn \
    -vf "scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease,fps=fps=30" \
    -c:v libvpx -deadline good -cpu-used 2 -b:v 2200k -c:a libopus -b:a 128k \
    -f webm "$build_root/$extension.webm"
done
cp "$binary" "$project_root/out/ffmpeg-macos-$arch/ffmpeg"
shasum -a 256 "$project_root/out/ffmpeg-macos-$arch/ffmpeg"
