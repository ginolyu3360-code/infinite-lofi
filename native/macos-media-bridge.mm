#import <Foundation/Foundation.h>
#import <MediaPlayer/MediaPlayer.h>
#include <node_api.h>

#include <cmath>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

static void CallJavaScript(
  napi_env env,
  napi_value callback,
  void *,
  void *data
) {
  char *command = static_cast<char *>(data);
  if (env && callback && command) {
    napi_value global;
    napi_value argument;
    napi_value ignored;
    napi_get_global(env, &global);
    napi_create_string_utf8(env, command, NAPI_AUTO_LENGTH, &argument);
    napi_call_function(env, global, callback, 1, &argument, &ignored);
  }
  std::free(command);
}

@interface InfiniteLofiMediaBridge : NSObject
@property(nonatomic, assign) napi_threadsafe_function callback;
@property(nonatomic, strong) NSMutableArray<NSArray *> *registrations;
@property(nonatomic, assign) BOOL destroyed;
- (instancetype)initWithCallback:(napi_threadsafe_function)callback;
- (void)updateWithTitle:(NSString *)title
                 artist:(NSString *)artist
                  album:(NSString *)album
               duration:(double)duration
               position:(double)position
           playbackRate:(double)playbackRate
                  state:(NSString *)state;
- (void)clear;
- (void)destroy;
@end

@implementation InfiniteLofiMediaBridge

- (instancetype)initWithCallback:(napi_threadsafe_function)callback {
  self = [super init];
  if (!self) return nil;
  self.callback = callback;
  self.registrations = [NSMutableArray array];
  self.destroyed = NO;

  MPRemoteCommandCenter *center = [MPRemoteCommandCenter sharedCommandCenter];
  [self registerCommand:center.playCommand action:@"play"];
  [self registerCommand:center.pauseCommand action:@"pause"];
  [self registerCommand:center.togglePlayPauseCommand action:@"toggle"];
  [self registerCommand:center.stopCommand action:@"stop"];
  [self registerCommand:center.nextTrackCommand action:@"next"];
  [self registerCommand:center.previousTrackCommand action:@"previous"];
  center.changePlaybackPositionCommand.enabled = YES;
  __weak InfiniteLofiMediaBridge *weakSelf = self;
  id seekToken = [center.changePlaybackPositionCommand addTargetWithHandler:^MPRemoteCommandHandlerStatus(MPRemoteCommandEvent *event) {
    InfiniteLofiMediaBridge *strongSelf = weakSelf;
    if (!strongSelf || strongSelf.destroyed || !strongSelf.callback ||
        ![event isKindOfClass:[MPChangePlaybackPositionCommandEvent class]]) {
      return MPRemoteCommandHandlerStatusCommandFailed;
    }
    double position = ((MPChangePlaybackPositionCommandEvent *)event).positionTime;
    NSString *message = [NSString stringWithFormat:@"seek:%.6f", MAX(0, position)];
    char *copy = strdup(message.UTF8String);
    if (!copy) return MPRemoteCommandHandlerStatusCommandFailed;
    napi_status status = napi_call_threadsafe_function(
      strongSelf.callback,
      copy,
      napi_tsfn_nonblocking
    );
    if (status != napi_ok) {
      std::free(copy);
      return MPRemoteCommandHandlerStatusCommandFailed;
    }
    return MPRemoteCommandHandlerStatusSuccess;
  }];
  if (seekToken) {
    [self.registrations addObject:@[center.changePlaybackPositionCommand, seekToken]];
  }
  return self;
}

- (void)registerCommand:(MPRemoteCommand *)command action:(NSString *)action {
  command.enabled = YES;
  __weak InfiniteLofiMediaBridge *weakSelf = self;
  id token = [command addTargetWithHandler:^MPRemoteCommandHandlerStatus(MPRemoteCommandEvent *) {
    InfiniteLofiMediaBridge *strongSelf = weakSelf;
    if (!strongSelf || strongSelf.destroyed || !strongSelf.callback) {
      return MPRemoteCommandHandlerStatusCommandFailed;
    }
    char *copy = strdup(action.UTF8String);
    if (!copy) return MPRemoteCommandHandlerStatusCommandFailed;
    napi_status status = napi_call_threadsafe_function(
      strongSelf.callback,
      copy,
      napi_tsfn_nonblocking
    );
    if (status != napi_ok) {
      std::free(copy);
      return MPRemoteCommandHandlerStatusCommandFailed;
    }
    return MPRemoteCommandHandlerStatusSuccess;
  }];
  if (token) [self.registrations addObject:@[command, token]];
}

- (void)updateWithTitle:(NSString *)title
                 artist:(NSString *)artist
                  album:(NSString *)album
               duration:(double)duration
               position:(double)position
           playbackRate:(double)playbackRate
                  state:(NSString *)state {
  if (self.destroyed) return;
  if (title.length == 0 || [state isEqualToString:@"none"]) {
    [self clear];
    return;
  }

  NSMutableDictionary *info = [NSMutableDictionary dictionary];
  info[MPMediaItemPropertyTitle] = title;
  if (artist.length > 0) info[MPMediaItemPropertyArtist] = artist;
  if (album.length > 0) info[MPMediaItemPropertyAlbumTitle] = album;
  if (duration > 0) {
    info[MPMediaItemPropertyPlaybackDuration] = @(duration);
    info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = @(MAX(0, MIN(duration, position)));
  }
  info[MPNowPlayingInfoPropertyMediaType] = @(MPNowPlayingInfoMediaTypeAudio);
  info[MPNowPlayingInfoPropertyDefaultPlaybackRate] = @1.0;
  info[MPNowPlayingInfoPropertyPlaybackRate] = [state isEqualToString:@"playing"]
    ? @(playbackRate > 0 ? playbackRate : 1.0)
    : @0.0;

  MPNowPlayingInfoCenter *center = [MPNowPlayingInfoCenter defaultCenter];
  center.nowPlayingInfo = info;
  if ([state isEqualToString:@"playing"]) {
    center.playbackState = MPNowPlayingPlaybackStatePlaying;
  } else if ([state isEqualToString:@"paused"]) {
    center.playbackState = MPNowPlayingPlaybackStatePaused;
  } else {
    center.playbackState = MPNowPlayingPlaybackStateStopped;
  }
}

- (void)clear {
  MPNowPlayingInfoCenter *center = [MPNowPlayingInfoCenter defaultCenter];
  center.playbackState = MPNowPlayingPlaybackStateStopped;
  center.nowPlayingInfo = nil;
}

- (void)destroy {
  if (self.destroyed) return;
  self.destroyed = YES;
  for (NSArray *registration in self.registrations) {
    MPRemoteCommand *command = registration[0];
    id token = registration[1];
    [command removeTarget:token];
  }
  [self.registrations removeAllObjects];
  [self clear];
  if (self.callback) {
    napi_release_threadsafe_function(self.callback, napi_tsfn_abort);
    self.callback = nullptr;
  }
}

@end

static bool ReadString(
  napi_env env,
  napi_value object,
  const char *name,
  std::string *output
) {
  napi_value value;
  bool present = false;
  if (napi_has_named_property(env, object, name, &present) != napi_ok || !present) return false;
  if (napi_get_named_property(env, object, name, &value) != napi_ok) return false;
  napi_valuetype type;
  if (napi_typeof(env, value, &type) != napi_ok || type != napi_string) return false;
  size_t length = 0;
  napi_get_value_string_utf8(env, value, nullptr, 0, &length);
  std::vector<char> buffer(length + 1, '\0');
  size_t copied = 0;
  if (napi_get_value_string_utf8(env, value, buffer.data(), buffer.size(), &copied) != napi_ok) {
    return false;
  }
  output->assign(buffer.data(), copied);
  return true;
}

static double ReadDouble(
  napi_env env,
  napi_value object,
  const char *name,
  double fallback
) {
  napi_value value;
  bool present = false;
  double result = fallback;
  if (napi_has_named_property(env, object, name, &present) != napi_ok || !present) return fallback;
  if (napi_get_named_property(env, object, name, &value) != napi_ok) return fallback;
  return napi_get_value_double(env, value, &result) == napi_ok && std::isfinite(result)
    ? result
    : fallback;
}

static InfiniteLofiMediaBridge *UnwrapBridge(napi_env env, napi_callback_info info) {
  napi_value receiver;
  size_t argc = 0;
  if (napi_get_cb_info(env, info, &argc, nullptr, &receiver, nullptr) != napi_ok) return nil;
  void *data = nullptr;
  if (napi_unwrap(env, receiver, &data) != napi_ok) return nil;
  return (__bridge InfiniteLofiMediaBridge *)data;
}

static napi_value Update(napi_env env, napi_callback_info info) {
  napi_value receiver;
  napi_value arguments[1];
  size_t argc = 1;
  napi_get_cb_info(env, info, &argc, arguments, &receiver, nullptr);
  void *data = nullptr;
  napi_unwrap(env, receiver, &data);
  InfiniteLofiMediaBridge *bridge = (__bridge InfiniteLofiMediaBridge *)data;
  if (!bridge || argc < 1) return receiver;

  napi_valuetype type;
  if (napi_typeof(env, arguments[0], &type) != napi_ok || type != napi_object) return receiver;
  std::string title;
  std::string artist;
  std::string album;
  std::string state;
  ReadString(env, arguments[0], "title", &title);
  ReadString(env, arguments[0], "artist", &artist);
  ReadString(env, arguments[0], "album", &album);
  ReadString(env, arguments[0], "state", &state);
  [bridge updateWithTitle:[NSString stringWithUTF8String:title.c_str()]
                   artist:[NSString stringWithUTF8String:artist.c_str()]
                    album:[NSString stringWithUTF8String:album.c_str()]
                 duration:ReadDouble(env, arguments[0], "duration", 0)
                 position:ReadDouble(env, arguments[0], "position", 0)
             playbackRate:ReadDouble(env, arguments[0], "playbackRate", 1)
                    state:[NSString stringWithUTF8String:state.c_str()]];
  return receiver;
}

static napi_value Clear(napi_env env, napi_callback_info info) {
  InfiniteLofiMediaBridge *bridge = UnwrapBridge(env, info);
  [bridge clear];
  napi_value undefined;
  napi_get_undefined(env, &undefined);
  return undefined;
}

static napi_value Destroy(napi_env env, napi_callback_info info) {
  InfiniteLofiMediaBridge *bridge = UnwrapBridge(env, info);
  [bridge destroy];
  napi_value undefined;
  napi_get_undefined(env, &undefined);
  return undefined;
}

static void FinalizeBridge(napi_env, void *data, void *) {
  InfiniteLofiMediaBridge *bridge = (__bridge_transfer InfiniteLofiMediaBridge *)data;
  [bridge destroy];
}

static napi_value CreateBridge(napi_env env, napi_callback_info info) {
  napi_value arguments[1];
  size_t argc = 1;
  napi_get_cb_info(env, info, &argc, arguments, nullptr, nullptr);
  if (argc < 1) {
    napi_throw_type_error(env, nullptr, "createBridge requires a command callback");
    return nullptr;
  }
  napi_valuetype type;
  napi_typeof(env, arguments[0], &type);
  if (type != napi_function) {
    napi_throw_type_error(env, nullptr, "createBridge callback must be a function");
    return nullptr;
  }

  napi_value resourceName;
  napi_create_string_utf8(env, "Infinite Lo-Fi native media commands", NAPI_AUTO_LENGTH, &resourceName);
  napi_threadsafe_function callback;
  napi_status status = napi_create_threadsafe_function(
    env,
    arguments[0],
    nullptr,
    resourceName,
    0,
    1,
    nullptr,
    nullptr,
    nullptr,
    CallJavaScript,
    &callback
  );
  if (status != napi_ok) {
    napi_throw_error(env, nullptr, "Unable to create native media command callback");
    return nullptr;
  }

  InfiniteLofiMediaBridge *bridge = [[InfiniteLofiMediaBridge alloc] initWithCallback:callback];
  napi_value result;
  napi_create_object(env, &result);
  napi_property_descriptor properties[] = {
    {"update", nullptr, Update, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"clear", nullptr, Clear, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"destroy", nullptr, Destroy, nullptr, nullptr, nullptr, napi_default, nullptr}
  };
  napi_define_properties(env, result, 3, properties);
  napi_wrap(env, result, (__bridge_retained void *)bridge, FinalizeBridge, nullptr, nullptr);
  return result;
}

static napi_value Initialize(napi_env env, napi_value exports) {
  napi_property_descriptor property = {
    "createBridge", nullptr, CreateBridge, nullptr, nullptr, nullptr, napi_default, nullptr
  };
  napi_define_properties(env, exports, 1, &property);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Initialize)
