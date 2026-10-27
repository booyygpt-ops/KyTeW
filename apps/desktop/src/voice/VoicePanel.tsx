import {
  Headphones,
  HeadphoneOff,
  Mic,
  MicOff,
  PhoneOff,
  Radio,
  Signal,
  Volume2,
} from "lucide-react";
import { useState } from "react";
import { Avatar, ErrorBox } from "../ui";
import type { Channel } from "../types";
import { useVoice } from "./VoiceContext";

const quality: Record<string, string> = {
  excellent: "Mükemmel",
  good: "İyi",
  poor: "Zayıf",
  lost: "Bağlantı yok",
  unknown: "Ölçülüyor",
};
export function VoiceDock() {
  const voice = useVoice();
  if (!voice.channel) return null;
  return (
    <section className="voice-dock" aria-label="Ses bağlantısı">
      <div>
        <Radio size={16} />
        <span>
          <b>
            {voice.phase === "connecting"
              ? "Bağlanıyor…"
              : voice.phase === "reconnecting"
                ? "Yeniden bağlanıyor…"
                : "Ses bağlantısı"}
          </b>
          <small>{voice.channel.name}</small>
        </span>
        <button
          className="icon-button disconnect"
          aria-label="Ses kanalından ayrıl"
          onClick={() => void voice.leave()}
        >
          <PhoneOff size={17} />
        </button>
      </div>
      <div className="voice-controls">
        <button
          className={voice.muted ? "toggled" : ""}
          aria-label={voice.muted ? "Mikrofonu aç" : "Mikrofonu kapat"}
          disabled={voice.phase !== "connected"}
          onClick={() => void voice.toggleMute()}
        >
          {voice.muted ? <MicOff size={17} /> : <Mic size={17} />}
        </button>
        <button
          className={voice.deafened ? "toggled" : ""}
          aria-label={voice.deafened ? "Ses çıkışını aç" : "Ses çıkışını kapat"}
          onClick={voice.toggleDeafen}
        >
          {voice.deafened ? (
            <HeadphoneOff size={17} />
          ) : (
            <Headphones size={17} />
          )}
        </button>
        <span>{voice.members.length} kişi</span>
      </div>
    </section>
  );
}
export default function VoicePanel({ channel }: { channel: Channel }) {
  const voice = useVoice(),
    active = voice.channel?.id === channel.id,
    joined =
      active && (voice.phase === "connected" || voice.phase === "reconnecting");
  return (
    <section className="voice-panel">
      <div className="voice-heading">
        <div className="voice-orb">
          <Headphones size={34} />
        </div>
        <span className="eyebrow">AYNI FREKANSTA BULUŞUN</span>
        <h2>{channel.name}</h2>
        <p>Birlikte konuşun. Mikrofonunu istediğin an kapatabilirsin.</p>
      </div>
      <ErrorBox error={voice.error} />
      {!active ? (
        <button className="primary" onClick={() => void voice.join(channel)}>
          <Mic size={18} />
          {voice.channel ? "Bu ses kanalına geç" : "Ses kanalına katıl"}
        </button>
      ) : (
        <div className="voice-status" role="status">
          <i />
          {voice.phase === "connected"
            ? "Bağlandı"
            : voice.phase === "reconnecting"
              ? "Yeniden bağlanıyor…"
              : "Bağlantı ve mikrofon hazırlanıyor…"}
        </div>
      )}
      {voice.audioBlocked && active && (
        <button className="secondary" onClick={() => void voice.startAudio()}>
          <Volume2 size={18} /> Sesi etkinleştir
        </button>
      )}
      {active && (
        <div className="voice-grid">
          {voice.members.map((member) => (
            <ParticipantCard
              key={member.id}
              member={member}
              volume={voice.volume}
            />
          ))}
        </div>
      )}
      {joined && (
        <>
          <div className="voice-main-controls">
            <button
              className={`secondary ${voice.muted ? "toggled" : ""}`}
              aria-label={voice.muted ? "Mikrofonu aç" : "Mikrofonu kapat"}
              onClick={() => void voice.toggleMute()}
            >
              {voice.muted ? <MicOff size={18} /> : <Mic size={18} />}{" "}
              {voice.muted ? "Mikrofon kapalı" : "Mikrofon açık"}
            </button>
            <button
              className={`secondary ${voice.deafened ? "toggled" : ""}`}
              aria-label={
                voice.deafened ? "Ses çıkışını aç" : "Ses çıkışını kapat"
              }
              onClick={voice.toggleDeafen}
            >
              {voice.deafened ? (
                <HeadphoneOff size={18} />
              ) : (
                <Headphones size={18} />
              )}{" "}
              {voice.deafened ? "Ses çıkışı kapalı" : "Dinliyorsun"}
            </button>
            <button
              className="danger"
              aria-label="Görüşmeden ayrıl"
              onClick={() => void voice.leave()}
            >
              <PhoneOff size={18} /> Ayrıl
            </button>
          </div>
          <div className="voice-devices">
            <label>
              Mikrofon
              <select
                aria-label="Mikrofon cihazı"
                onChange={(e) =>
                  void voice.device("audioinput", e.target.value)
                }
                defaultValue=""
              >
                <option value="" disabled>
                  Cihaz seç
                </option>
                {voice.devices
                  .filter((d) => d.kind === "audioinput")
                  .map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || "Mikrofon"}
                    </option>
                  ))}
              </select>
            </label>
            {"setSinkId" in HTMLMediaElement.prototype ? (
              <label>
                Ses çıkışı
                <select
                  aria-label="Ses çıkış cihazı"
                  onChange={(e) =>
                    void voice.device("audiooutput", e.target.value)
                  }
                  defaultValue=""
                >
                  <option value="" disabled>
                    Cihaz seç
                  </option>
                  {voice.devices
                    .filter((d) => d.kind === "audiooutput")
                    .map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || "Hoparlör"}
                      </option>
                    ))}
                </select>
              </label>
            ) : (
              <p className="feature-note">
                Ses çıkışı cihazını işletim sistemi ayarlarından seçebilirsin.
              </p>
            )}
          </div>
        </>
      )}
      <p className="voice-privacy">
        Yalnızca bu sunucunun üyeleri katılabilir. Kamera ve ekran paylaşımı bu
        sürümde kapalıdır.
      </p>
    </section>
  );
}
function ParticipantCard({
  member,
  volume,
}: {
  member: {
    id: string;
    name: string;
    speaking: boolean;
    mic: boolean;
    quality: string;
    local: boolean;
  };
  volume: (id: string, amount: number) => void;
}) {
  const [level, setLevel] = useState(100);
  return (
    <article
      data-voice-member={member.id}
      className={`voice-person ${member.speaking ? "speaking" : ""}`}
    >
      <div className="voice-person-avatar">
        <Avatar user={{ id: member.id, displayName: member.name }} />
        {!member.mic && (
          <span>
            <MicOff size={13} />
          </span>
        )}
      </div>
      <b>
        {member.name}
        {member.local && <small> (sen)</small>}
      </b>
      <span className="voice-person-status">
        {!member.mic
          ? "Mikrofon kapalı"
          : member.speaking
            ? "Konuşuyor"
            : "Dinliyor"}
      </span>
      <span className="voice-quality">
        <Signal size={12} />
        {quality[member.quality] || "Ölçülüyor"}
      </span>
      {!member.local && (
        <label className="volume-slider">
          Ses · %{level}
          <input
            type="range"
            aria-label={`${member.name} ses seviyesi`}
            min={0}
            max={100}
            value={level}
            onChange={(e) => {
              const value = Number(e.target.value);
              setLevel(value);
              volume(member.id, value / 100);
            }}
          />
        </label>
      )}
    </article>
  );
}
