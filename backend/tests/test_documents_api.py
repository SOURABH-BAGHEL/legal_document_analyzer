from app.database import SessionLocal
from app.models import Analysis
from tests.conftest import upload


def test_upload_txt_pdf_docx(client, sample_txt, sample_pdf, sample_docx):
    for name, data, mime in (
        ("lease.txt", sample_txt, "text/plain"),
        ("lease.pdf", sample_pdf, "application/pdf"),
        ("lease.docx", sample_docx, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ):
        res = upload(client, name, data, mime)
        assert res.status_code == 201, res.text
        body = res.json()
        assert body["original_filename"] == name
        assert body["extraction_status"] == "completed"
        assert body["analysis_status"] == "not_started"
        assert body["char_count"] > 1000
        assert "secure_file_reference" not in body and "filename" not in body  # internal paths never exposed


def test_upload_rejections_use_clear_errors(client):
    res = upload(client, "virus.exe", b"MZ", "application/octet-stream")
    assert res.status_code == 415
    assert res.json()["error"]["code"] == "UNSUPPORTED_FILE_TYPE"

    res = upload(client, "empty.txt", b"", "text/plain")
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "EMPTY_FILE"

    res = upload(client, "broken.pdf", b"%PDF-1.4 garbage", "application/pdf")
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "CORRUPTED_PDF"

    # Nothing was stored for rejected uploads.
    assert client.get("/api/documents/").json()["total"] == 0


def test_list_search_filter_and_get(client, sample_txt, sample_pdf):
    a = upload(client, "rental-agreement.txt", sample_txt).json()
    upload(client, "employment.pdf", sample_pdf, "application/pdf")

    listing = client.get("/api/documents/").json()
    assert listing["total"] == 2

    assert [d["id"] for d in client.get("/api/documents/?q=rental").json()["items"]] == [a["id"]]
    assert client.get("/api/documents/?file_type=pdf").json()["total"] == 1
    assert client.get("/api/documents/?file_type=exe").status_code == 422

    detail = client.get(f"/api/documents/{a['id']}")
    assert detail.status_code == 200 and detail.json()["id"] == a["id"]

    content = client.get(f"/api/documents/{a['id']}/content").json()
    assert content["location_unit"] == "section" and "Arjun Mehta" in content["pages"][0]


def test_get_missing_document_404(client):
    res = client.get("/api/documents/00000000-0000-0000-0000-000000000000")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "DOCUMENT_NOT_FOUND"


def test_delete_removes_record_file_and_analyses(client, sample_txt, storage_dir):
    doc = upload(client, "lease.txt", sample_txt).json()
    assert client.post(f"/api/analysis/{doc['id']}/analyze", json={}).status_code == 202
    assert len(list(storage_dir.iterdir())) == 1

    res = client.delete(f"/api/documents/{doc['id']}")
    assert res.status_code == 200 and res.json()["deleted"] is True

    assert client.get(f"/api/documents/{doc['id']}").status_code == 404
    assert client.get(f"/api/analysis/{doc['id']}").status_code == 404
    assert list(storage_dir.iterdir()) == []
    with SessionLocal() as db:
        assert db.query(Analysis).count() == 0

    assert client.delete(f"/api/documents/{doc['id']}").status_code == 404
