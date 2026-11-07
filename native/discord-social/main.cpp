#define DISCORDPP_IMPLEMENTATION
#include "discordpp.h"
#include <atomic>
#include <chrono>
#include <iostream>
#include <memory>
#include <mutex>
#include <deque>
#include <sstream>
#include <unordered_set>
#include <regex>
#include <string>
#include <thread>

// A session-only SDK bridge: tokens never leave this process or reach disk.
static std::string quote(const std::string& text) {
    std::string out = "\"";
    const char* hex = "0123456789abcdef";
    for (unsigned char ch : text) {
        if (ch == '"' || ch == '\\') { out += '\\'; out += ch; }
        else if (ch < 32) { out += "\\u00"; out += hex[ch >> 4]; out += hex[ch & 15]; }
        else out += ch;
    }
    return out + "\"";
}
static void emit(const std::string& json) { std::cout << json << std::endl; }
static void phase(const char* value, int code = 0) {
    emit("{\"phase\":" + quote(value) + ",\"code\":" + std::to_string(code) + "}");
}
static void failure(const char* value, const discordpp::ClientResult& result) {
    // Report the provider's error, without long identifiers, credentials, or URL query values.
    auto message = std::regex_replace(result.Error(), std::regex("[A-Za-z0-9_.~%/+=-]{24,}"), "[redacted]");
    emit("{\"phase\":" + quote(value) + ",\"code\":" + std::to_string(result.ErrorCode()) + ",\"message\":" + quote(message.substr(0, 500)) + "}");
}
static void operationError(int request, const char* operation, const discordpp::ClientResult& result) {
    emit("{\"event\":\"error\",\"request\":" + std::to_string(request) + ",\"operation\":" + quote(operation) + ",\"code\":" + std::to_string(result.ErrorCode()) + ",\"http\":" + std::to_string(static_cast<int>(result.Status())) + ",\"retry\":" + std::to_string(result.RetryAfter()) + "}");
}
static std::string unhex(const std::string& value) {
    if (value.size() % 2 || value.size() > 16000) return "";
    std::string out;
    for (size_t i = 0; i < value.size(); i += 2) {
        auto digit = [](char c) { return c >= '0' && c <= '9' ? c - '0' : c >= 'a' && c <= 'f' ? c - 'a' + 10 : -1; };
        int a = digit(value[i]), b = digit(value[i + 1]); if (a < 0 || b < 0) return "";
        out += static_cast<char>(a * 16 + b);
    }
    return out;
}

int main(int argc, char** argv) {
    if (argc != 2) return 2;
    uint64_t applicationId;
    try { applicationId = std::stoull(argv[1]); } catch (...) { return 2; }
    static std::atomic<bool> running{true};
    static std::mutex mutex;
    static std::deque<std::string> commands;
    std::thread([]() { std::string line; while (std::getline(std::cin, line)) {
        if (line == "quit") break;
        std::lock_guard lock(mutex); if (line.size() <= 20000 && commands.size() < 64) commands.push_back(line);
    } running = false; }).detach();
    auto client = std::make_shared<discordpp::Client>();
    client->SetApplicationId(applicationId);
    bool ready = false;
    uint64_t room = 0;
    bool joiningRoom = false;
    std::optional<discordpp::Call> call;
    bool muted = true, deaf = false;
    std::unordered_set<uint64_t> speakers;
    auto audio = [&]() {
        auto self = client->GetCurrentUserV2(); bool audible = false;
        if (room && !deaf) for (auto id : speakers) if (!self || id != self->Id()) audible = true;
        emit("{\"event\":\"voice_audio\",\"audible\":" + std::string(audible ? "true" : "false") + "}");
    };
    client->SetSelfMuteAll(true);
    auto history = [client](int request, uint64_t recipient) {
        client->GetUserMessagesWithLimit(recipient, 50, [client, request, recipient](auto result, auto messages) {
            if (!result.Successful()) { operationError(request, "history", result); return; }
            std::string json = "{\"event\":\"history\",\"request\":" + std::to_string(request) + ",\"recipient\":" + quote(std::to_string(recipient)) + ",\"messages\":[";
            bool first = true;
            for (auto it = messages.rbegin(); it != messages.rend(); ++it) {
                auto author = it->Author();
                if (!first) json += ','; first = false;
                auto content = it->Content();
                if (content.empty() && it->DisclosureType()) content = "Messages in this conversation may also be visible in Discord.";
                json += "{\"id\":" + quote(std::to_string(it->Id())) + ",\"author\":" + quote(author ? author->DisplayName() : "Discord user") + ",\"content\":" + quote(content) + ",\"time\":" + std::to_string(it->SentTimestamp()) + ",\"canOpen\":" + (client->CanOpenMessageInDiscord(it->Id()) ? "true" : "false") + "}";
            }
            emit(json + "]}");
        });
    };
    client->SetMessageCreatedCallback([client](uint64_t messageId) {
        auto message = client->GetMessageHandle(messageId);
        if (message && message->RecipientId()) emit("{\"event\":\"changed\",\"recipient\":" + quote(std::to_string(message->RecipientId())) + "}");
    });
    client->SetMessageUpdatedCallback([client](uint64_t messageId) {
        auto message = client->GetMessageHandle(messageId);
        if (message && message->RecipientId()) emit("{\"event\":\"changed\",\"recipient\":" + quote(std::to_string(message->RecipientId())) + "}");
    });
    client->SetMessageDeletedCallback([client](uint64_t, uint64_t channelId) {
        auto channel = client->GetChannelHandle(channelId);
        if (channel) for (auto id : channel->Recipients()) emit("{\"event\":\"changed\",\"recipient\":" + quote(std::to_string(id)) + "}");
    });
    client->SetTokenExpirationCallback([&]() { ready = false; client->Disconnect(); phase("session_expired"); });
    client->SetStatusChangedCallback([&](auto status, auto error, int32_t detail) {
        ready = status == discordpp::Client::Status::Ready;
        if (ready) phase("ready");
        else if (error != discordpp::Client::Error::None) phase("connection_error", detail);
        else phase("connecting");
    });
    auto verifier = client->CreateAuthorizationCodeVerifier();
    discordpp::AuthorizationArgs args;
    args.SetClientId(applicationId);
    args.SetScopes(discordpp::Client::GetDefaultCommunicationScopes());
    args.SetCodeChallenge(verifier.Challenge());
    phase("authorizing");
    client->Authorize(args, [client, verifier, applicationId](auto result, auto code, auto redirectUri) {
        if (!result.Successful()) { failure("authorization_error", result); return; }
        phase("exchanging");
        client->GetToken(applicationId, code, verifier.Verifier(), redirectUri,
            [client](auto result, auto accessToken, auto, auto, auto, auto) {
                if (!result.Successful()) { failure("token_error", result); return; }
                client->UpdateToken(discordpp::AuthorizationTokenType::Bearer, accessToken,
                    [client](auto result) {
                        if (!result.Successful()) { failure("token_error", result); return; }
                        phase("connecting"); client->Connect();
                    });
            });
    });
    auto next = std::chrono::steady_clock::now();
    std::string previous, previousVoice;
    while (running) {
        discordpp::RunCallbacks();
        std::deque<std::string> todo;
        { std::lock_guard lock(mutex); todo.swap(commands); }
        if (ready) for (auto& line : todo) {
            std::istringstream input(line); std::string command, value; int request = 0; uint64_t recipient = 0;
            input >> command >> request;
            if (command == "history") { input >> recipient; if (recipient) history(request, recipient); }
            else if (command == "send") {
                input >> recipient >> value; auto content = unhex(value);
                if (recipient && !content.empty()) client->SendUserMessage(recipient, content, [request](auto result, uint64_t) {
                    if (!result.Successful()) operationError(request, "send", result);
                    else emit("{\"event\":\"sent\",\"request\":" + std::to_string(request) + "}");
                });
            } else if (command == "open") {
                input >> recipient;
                if (client->CanOpenMessageInDiscord(recipient)) client->OpenMessageInDiscord(recipient, []() {}, [](auto) {});
            } else if (command == "summaries") {
                client->GetUserMessageSummaries([client, request](auto result, auto summaries) {
                    if (!result.Successful()) { operationError(request, "summaries", result); return; }
                    std::string json = "{\"event\":\"summaries\",\"request\":" + std::to_string(request) + ",\"conversations\":["; bool first = true;
                    for (auto& summary : summaries) {
                        auto user = client->GetUser(summary.UserId()); if (!first) json += ','; first = false;
                        json += "{\"id\":" + quote(std::to_string(summary.UserId())) + ",\"name\":" + quote(user ? user->DisplayName() : "Discord user") + "}";
                    }
                    emit(json + "]}");
                });
            } else if (command == "room" && !room && !call && !joiningRoom) {
                input >> value;
                joiningRoom = true;
                client->CreateOrJoinLobby(value, [&, request](auto result, uint64_t lobby) {
                    joiningRoom = false;
                    if (!result.Successful()) { operationError(request, "room", result); return; }
                    room = lobby; muted = true; deaf = false;
                    client->SetSelfMuteAll(true); client->SetSelfDeafAll(false);
                    call = client->StartCall(room); call->SetSelfMute(true);
                    speakers.clear();
                    call->SetSpeakingStatusChangedCallback([&](uint64_t id, bool speaking) { if (speaking) speakers.insert(id); else speakers.erase(id); audio(); });
                });
            } else if (command == "leave" && room) {
                auto leaving = room; room = 0; call.reset(); speakers.clear(); audio();
                client->EndCall(leaving, [client, leaving]() { client->LeaveLobby(leaving, [](auto) {}); });
            } else if (command == "mute" && call) { input >> muted; call->SetSelfMute(muted); }
            else if (command == "deaf" && call) { input >> deaf; call->SetSelfDeaf(deaf); audio(); }
        }
        auto now = std::chrono::steady_clock::now();
        if (ready && now >= next) {
            next = now + std::chrono::seconds(2);
            std::string json = "{\"phase\":\"ready\",\"friends\":[";
            bool first = true;
            for (auto& relationship : client->GetRelationships()) {
                if (relationship.DiscordRelationshipType() != discordpp::RelationshipType::Friend) continue;
                auto user = relationship.User();
                if (!user) continue;
                if (!first) json += ',';
                first = false;
                json += "{\"id\":" + quote(std::to_string(relationship.Id())) +
                    ",\"name\":" + quote(user->DisplayName()) +
                    ",\"status\":" + std::to_string(static_cast<int>(user->Status())) + "}";
            }
            json += "]}";
            if (json != previous) { emit(json); previous = json; }
            std::string voice = "{\"event\":\"voice\",\"active\":" + std::string(room ? "true" : "false") + ",\"status\":" + quote(call ? discordpp::Call::StatusToString(call->GetStatus()) : "Disconnected") + ",\"muted\":" + (muted ? "true" : "false") + ",\"deaf\":" + (deaf ? "true" : "false") + ",\"participants\":[";
            bool firstParticipant = true;
            if (call) for (auto id : call->GetParticipants()) {
                auto user = client->GetUser(id);
                if (!firstParticipant) voice += ','; firstParticipant = false;
                voice += "{\"id\":" + quote(std::to_string(id)) + ",\"name\":" + quote(user ? user->DisplayName() : "Discord user") + "}";
            }
            voice += "]}";
            if (voice != previousVoice) { emit(voice); previousVoice = voice; audio(); }
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(20));
    }
    client->AbortAuthorize();
    client->Disconnect();
    return 0;
}
