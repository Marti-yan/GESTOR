// A lógica da fila não depende do Electron: é exercitada com a impressora simulada nos testes.
class PrintAgent {
  constructor({ api, print, loadJournal, saveJournal, onError = () => {} }) {
    this.api = api;
    this.print = print;
    this.saveJournal = saveJournal;
    this.onError = onError;
    this.busy = false;
    this.journal = loadJournal();
    for (const entry of Object.values(this.journal))
      if (entry.state === "printing" && !entry.acknowledged) {
        entry.state = "uncertain";
        entry.error =
          "O aplicativo reiniciou durante a impressão. Confira a saída física antes de reenviar.";
      }
    this.persist();
  }
  persist() {
    const entries = Object.entries(this.journal);
    if (entries.length > 300) {
      for (const [id, entry] of entries.slice(0, entries.length - 300))
        if (entry.acknowledged) delete this.journal[id];
    }
    this.saveJournal(this.journal);
  }
  async report(id, entry) {
    await this.api(`/admin/printing/jobs/${id}/result`, "POST", {
      claimToken: entry.claimToken,
      state: entry.state,
      error: entry.error || "",
    });
    entry.acknowledged = true;
    this.persist();
  }
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      for (const [id, entry] of Object.entries(this.journal)) {
        if (
          !entry.acknowledged &&
          ["spooled", "failed", "uncertain"].includes(entry.state)
        ) {
          try {
            await this.report(id, entry);
          } catch (error) {
            if (error.status === 409) {
              entry.acknowledged = true;
              this.persist();
            } else throw error;
          }
        }
      }
      const { job } = await this.api("/admin/printing/claim", "POST", {});
      if (!job) return;
      const previous = this.journal[job.id];
      if (
        previous &&
        previous.claimToken === job.claimToken &&
        previous.state === "spooled"
      ) {
        await this.report(job.id, previous);
        return;
      }
      const entry = {
        claimToken: job.claimToken,
        state: "claimed",
        acknowledged: false,
        error: "",
      };
      this.journal[job.id] = entry;
      this.persist();
      await this.api(`/admin/printing/jobs/${job.id}/start`, "POST", {
        claimToken: job.claimToken,
      });
      // Gravação durável ANTES do efeito físico: um reinício exige conferência, nunca repetição cega.
      entry.state = "printing";
      this.persist();
      try {
        await this.print(job);
        entry.state = "spooled";
        entry.error = "";
      } catch (error) {
        entry.state = error.uncertain ? "uncertain" : "failed";
        entry.error = error.message || "Falha ao imprimir.";
        this.onError(entry.error);
      }
      this.persist();
      await this.report(job.id, entry);
    } catch (error) {
      this.onError(error.message || "Não foi possível sincronizar a fila.");
    } finally {
      this.busy = false;
    }
  }
}
module.exports = { PrintAgent };
