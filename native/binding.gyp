{
  "targets": [
    {
      "target_name": "macos_media_bridge",
      "conditions": [
        ["OS=='mac'", {
          "sources": ["macos-media-bridge.mm"],
          "xcode_settings": {
            "CLANG_ENABLE_OBJC_ARC": "YES",
            "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
            "MACOSX_DEPLOYMENT_TARGET": "13.0",
            "OTHER_CPLUSPLUSFLAGS": ["-fblocks"],
            "OTHER_LDFLAGS": [
              "-framework Foundation",
              "-framework MediaPlayer"
            ]
          }
        }],
        ["OS!='mac'", {
          "type": "none"
        }]
      ]
    }
  ]
}
