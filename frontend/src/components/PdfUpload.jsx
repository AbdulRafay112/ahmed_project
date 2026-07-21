import axios from "axios";
import { useState } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

function PdfUpload() {
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const upload = async () => {
    if (!file) {
      setError("Please select a PDF file.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const fd = new FormData();
      fd.append("pdf", file);

      const res = await axios.post(
        `${API_BASE_URL}/api/pdf/invoice`,
        fd,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );

      setRows(res.data.items || []);
    } catch (err) {
      console.error(err);
      setError(
        err.response?.data?.message ||
          "Failed to upload and process the PDF."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <input
        type="file"
        accept=".pdf"
        onChange={(e) => setFile(e.target.files[0] || null)}
      />

      <button onClick={upload} disabled={loading || !file}>
        {loading ? "Uploading..." : "Upload Invoice"}
      </button>

      {error && <p style={{ color: "red" }}>{error}</p>}

      <table border="1">
        <thead>
          <tr>
            <th>Description</th>
            <th>Amount</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((item, index) => (
            <tr key={index}>
              <td>{item.description}</td>
              <td>{item.amount}</td>
            </tr>
          ))}

          {rows.length === 0 && !loading && (
            <tr>
              <td colSpan="2" style={{ textAlign: "center" }}>
                No data extracted yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default PdfUpload;