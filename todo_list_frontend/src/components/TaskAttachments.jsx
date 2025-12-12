import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * TaskAttachments: Inline panel to manage a task's attachments (images and voice notes).
 * - Supports adding images via file input (multiple).
 * - Supports recording voice notes using MediaRecorder with timer and basic controls.
 * - Lists attachments with thumbnails or audio player, metadata and delete action.
 *
 * Props:
 * - task: { id, attachments?: [] }
 * - addAttachment(taskId, attachment)
 * - removeAttachment(taskId, attachmentId)
 * - replaceAttachmentMeta(taskId, attachmentId, patch)
 * - onClose(): optional close handler
 */
// PUBLIC_INTERFACE
export default function TaskAttachments({
  task,
  addAttachment,
  removeAttachment,
  replaceAttachmentMeta,
  onClose,
}) {
  /** Manage attachments for a single task. */
  const attachments = useMemo(
    () => (Array.isArray(task?.attachments) ? task.attachments : []),
    [task]
  );

  // Recording state
  const [recSupported, setRecSupported] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [sizeWarning, setSizeWarning] = useState("");
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const liveRegionRef = useRef(null);

  useEffect(() => {
    setRecSupported(typeof window !== "undefined" && !!(window.MediaRecorder));
  }, []);

  useEffect(() => {
    if (isRecording) {
      setSeconds(0);
      timerRef.current = setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  function announceStatus(msg) {
    if (liveRegionRef.current) {
      liveRegionRef.current.textContent = msg;
    }
  }

  // Helpers: file size thresholds (bytes)
  const FIVE_MB = 5 * 1024 * 1024;
  const DATAURL_LIMIT = 2 * 1024 * 1024; // prefer data URL up to 2MB

  async function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      try {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(file);
      } catch (e) {
        reject(e);
      }
    });
  }

  function humanSize(bytes) {
    if (!bytes && bytes !== 0) return "";
    const thresh = 1024;
    if (Math.abs(bytes) < thresh) return bytes + " B";
    const units = ["KB", "MB", "GB", "TB"];
    let u = -1;
    do {
      bytes /= thresh;
      ++u;
    } while (Math.abs(bytes) >= thresh && u < units.length - 1);
    return bytes.toFixed(1) + " " + units[u];
  }

  const onSelectImages = async (e) => {
    setError("");
    setSizeWarning("");
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    for (const file of files) {
      try {
        if (file.size > FIVE_MB) {
          setSizeWarning("Some files exceed 5MB and were skipped.");
          continue; // guard
        }
        let payload;
        let storeAsDataUrl = file.size <= DATAURL_LIMIT;
        if (storeAsDataUrl) {
          const dataUrl = await fileToDataURL(file);
          payload = { data: dataUrl, url: null };
        } else {
          const url = URL.createObjectURL(file);
          payload = { data: null, url };
        }
        const now = new Date().toISOString();
        const att = {
          id: `att_${Math.random().toString(36).slice(2)}_${Date.now()}`,
          type: "image",
          name: file.name || "photo",
          createdAt: now,
          size: file.size,
          ...payload,
        };
        addAttachment(task.id, att);
      } catch (e2) {
        setError("Failed to read selected image(s).");
      }
    }
    // reset input
    e.target.value = "";
  };

  const startRecording = async () => {
    if (!recSupported || isRecording) return;
    setError("");
    setSizeWarning("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          chunksRef.current.push(ev.data);
        }
      };
      recorder.onstart = () => {
        setIsRecording(true);
        announceStatus("Recording started");
      };
      recorder.onstop = async () => {
        setIsRecording(false);
        try {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
          // size guard
          if (blob.size > FIVE_MB) {
            setSizeWarning("Voice note longer than 5MB was not saved.");
            return;
          }
          const duration = seconds;
          let payload;
          // Try to store as data URL when small
          if (blob.size <= DATAURL_LIMIT) {
            const reader = new FileReader();
            const dataUrl = await new Promise((resolve, reject) => {
              reader.onload = () => resolve(reader.result);
              reader.onerror = (e) => reject(e);
              reader.readAsDataURL(blob);
            });
            payload = { data: dataUrl, url: null };
          } else {
            const url = URL.createObjectURL(blob);
            payload = { data: null, url };
          }
          const now = new Date().toISOString();
          const name = `voice_${now.replace(/[:.]/g, "-")}.webm`;
          const att = {
            id: `att_${Math.random().toString(36).slice(2)}_${Date.now()}`,
            type: "audio",
            name,
            createdAt: now,
            size: blob.size,
            durationSeconds: duration,
            ...payload,
          };
          addAttachment(task.id, att);
          announceStatus("Recording saved");
        } catch (e) {
          setError("Failed to save recording.");
        } finally {
          // stop all tracks
          stream.getTracks().forEach((t) => t.stop());
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
    } catch (e) {
      console.warn(e);
      setError("Microphone permission denied or not available.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
  };

  const onOpenImage = (att) => {
    try {
      const toOpen = att.data || att.url;
      if (toOpen) {
        window.open(toOpen, "_blank", "noopener,noreferrer");
      }
    } catch {
      // ignore
    }
  };

  // Focus management: move focus to first interactive element on mount
  const firstFocusRef = useRef(null);
  useEffect(() => {
    if (firstFocusRef.current) firstFocusRef.current.focus();
  }, []);

  return (
    <div className="attachments-panel" role="region" aria-label={`Attachments for ${task?.title || "task"}`}>
      <div className="attachments-header">
        <div className="attachments-title">Attachments</div>
        {typeof onClose === "function" ? (
          <button
            className="icon-btn"
            onClick={onClose}
            aria-label="Close attachments"
            title="Close"
            ref={firstFocusRef}
          >
            ✖️
          </button>
        ) : null}
      </div>

      <div className="attachments-tools">
        <div className="upload-group">
          <label htmlFor={`att-photo-${task.id}`} className="btn btn-small" title="Add photos">
            Add Photo
          </label>
          <input
            id={`att-photo-${task.id}`}
            type="file"
            accept="image/*"
            multiple
            onChange={onSelectImages}
            aria-label="Select image files"
            style={{ display: "none" }}
          />
          {recSupported ? (
            <div className="record-controls" role="group" aria-label="Voice note recorder">
              <button
                className={`record-btn ${isRecording ? "recording" : ""}`}
                onClick={isRecording ? stopRecording : startRecording}
                aria-pressed={isRecording}
                aria-label={isRecording ? "Stop recording voice note" : "Start recording voice note"}
                title="Record voice note"
              >
                {isRecording ? "■ Stop" : "● Record"}
              </button>
              <div className="record-timer" aria-live="polite">
                {isRecording ? `Recording ${Math.floor(seconds / 60)
                  .toString()
                  .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}` : "Idle"}
              </div>
            </div>
          ) : (
            <div className="record-unsupported" aria-live="polite">
              Voice notes not supported in this browser.
            </div>
          )}
        </div>
        <div className="att-hint">Images up to 5MB. Large files may be stored as temporary object URLs and won't persist across reloads.</div>
      </div>

      {error ? (
        <div className="att-error" role="status" aria-live="assertive">
          {error}
        </div>
      ) : null}
      {sizeWarning ? (
        <div className="att-warn" role="status" aria-live="polite">
          {sizeWarning}
        </div>
      ) : null}
      <div ref={liveRegionRef} className="sr-only" aria-live="polite" />

      <div className="attachment-list">
        {attachments.length === 0 ? (
          <div className="empty">No attachments yet.</div>
        ) : (
          attachments.map((a) => (
            <div key={a.id} className="attachment-card">
              <div className="attachment-thumb">
                {a.type === "image" ? (
                  <button
                    className="thumb-button"
                    onClick={() => onOpenImage(a)}
                    aria-label={`Open image ${a.name}`}
                    title="Open image"
                  >
                    <img
                      src={a.data || a.url}
                      alt={a.name || "image"}
                      className="attachment-img"
                    />
                  </button>
                ) : (
                  <div className="audio-container">
                    <audio controls src={a.data || a.url} preload="metadata" />
                    <div className="audio-meta">
                      {typeof a.durationSeconds === "number"
                        ? `${Math.floor(a.durationSeconds / 60)
                            .toString()
                            .padStart(2, "0")}:${(a.durationSeconds % 60)
                            .toString()
                            .padStart(2, "0")}`
                        : ""}
                    </div>
                  </div>
                )}
              </div>
              <div className="attachment-meta">
                <div className="attachment-name" title={a.name}>{a.name}</div>
                <div className="attachment-sub">
                  <span className="chip">{a.type}</span>
                  {a.size ? <span className="chip">{humanSize(a.size)}</span> : null}
                  {a.createdAt ? (
                    <span className="chip">{new Date(a.createdAt).toLocaleString()}</span>
                  ) : null}
                </div>
              </div>
              <div className="attachment-actions">
                <button
                  className="icon-btn danger"
                  onClick={() => removeAttachment(task.id, a.id)}
                  aria-label={`Delete attachment ${a.name}`}
                  title="Delete"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
