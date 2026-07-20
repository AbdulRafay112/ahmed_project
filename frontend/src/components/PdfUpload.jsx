import axios from "axios";
import { useState } from "react";

function PdfUpload() {

    const [file, setFile] = useState();

    const [rows, setRows] = useState([]);

    const upload = async () => {

        const fd = new FormData();

        fd.append("pdf", file);

        const res = await axios.post(
            "http://localhost:5000/api/pdf/invoice",
            fd
        );

        setRows(res.data.items);

    }

    return (

        <div>

            <input
                type="file"
                accept=".pdf"
                onChange={(e)=>setFile(e.target.files[0])}
            />

            <button onClick={upload}>
                Upload Invoice
            </button>

            <table border="1">

                <thead>

                    <tr>

                        <th>Description</th>

                        <th>Amount</th>

                    </tr>

                </thead>

                <tbody>

                    {

                        rows.map((item,index)=>(

                            <tr key={index}>

                                <td>{item.description}</td>

                                <td>{item.amount}</td>

                            </tr>

                        ))

                    }

                </tbody>

            </table>

        </div>

    )

}

export default PdfUpload;