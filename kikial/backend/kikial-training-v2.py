import hashlib
import json
import shutil
import subprocess
from pathlib import Path

ROWS = []

def add(topic, question, answer, *, split='train', language=None, checks=None):
    ROWS.append(dict(topic=topic, question=question, answer=answer, split=split,
                     language=language, checks=checks))

add('python-prime', 'Viết hàm Python kiểm tra số nguyên tố cho đầu vào là số nguyên.',
'''def is_prime(n):
    if n < 2:
        return False
    divisor = 2
    while divisor * divisor <= n:
        if n % divisor == 0:
            return False
        divisor += 1
    return True''', language='python', checks='assert [is_prime(n) for n in [-3,0,1,2,9,17,49]] == [False,False,False,True,False,True,False]')
add('python-binary-search', 'Viết tìm kiếm nhị phân Python trên danh sách tăng dần, không thấy trả -1.',
'''def binary_search(values, target):
    left, right = 0, len(values) - 1
    while left <= right:
        mid = (left + right) // 2
        if values[mid] == target:
            return mid
        if values[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return -1''', language='python', checks='assert binary_search([], 1) == -1\nassert binary_search([1,3,5], 3) == 1\nassert binary_search([1,3,5], 2) == -1\nassert binary_search([1,3,5], 5) == 2')
add('python-frequency', 'Đếm số lần xuất hiện của mỗi phần tử chuỗi trong list bằng Python.',
'''def frequencies(values):
    counts = {}
    for value in values:
        counts[value] = counts.get(value, 0) + 1
    return counts''', language='python', checks="assert frequencies(['a','b','a']) == {'a':2,'b':1}\nassert frequencies([]) == {}")
add('python-deduplicate', 'Loại phần tử lặp trong list số nguyên Python, giữ thứ tự xuất hiện đầu tiên.',
'''def unique(values):
    return list(dict.fromkeys(values))''', language='python', checks='assert unique([3,1,3,2,1]) == [3,1,2]\nassert unique([]) == []')
add('js-even-sum', 'JavaScript: tính tổng số chẵn không âm nhỏ hơn số nguyên n, không dùng if.',
'''function evenSum(n) {
  let total = 0;
  for (let i = 0; i < n; i += 2) total += i;
  return total;
}''', language='javascript', checks='assert.equal(evenSum(10),20); assert.equal(evenSum(0),0); assert.equal(evenSum(7),12);')
add('js-null-safe', 'JavaScript: lấy email từ user có thể null; thiếu email trả chuỗi rỗng.',
'''function getEmail(user) {
  return user?.email ?? '';
}''', language='javascript', checks="assert.equal(getEmail(null),''); assert.equal(getEmail({}),''); assert.equal(getEmail({email:'abc'}),'abc');")
add('js-copy-array', 'Sao chép mảng JavaScript bằng spread có sao chép sâu không?', 'Không. [...items] tạo mảng mới nhưng chỉ sao chép nông. Nếu phần tử là object thì hai mảng vẫn tham chiếu đến cùng object đó.')
add('js-const', 'Biến const chứa object trong JavaScript có sửa thuộc tính được không?', 'Có. const ngăn gán lại biến sang giá trị khác, không tự đóng băng thuộc tính của object. Ví dụ const a = {x: 1}; a.x = 2; là hợp lệ.')
add('js-event-loop', 'await có chặn toàn bộ luồng JavaScript không?', 'await tạm dừng phần còn lại của hàm async cho tới khi giá trị chờ được giải quyết. Nó không tự chặn toàn bộ luồng JavaScript; các tác vụ khác có thể tiếp tục khi event loop xử lý chúng. Tính toán đồng bộ nặng vẫn có thể chặn luồng.')
add('dart-return', 'Dart: phân biệt void và int ở kiểu trả về của hàm.', 'void biểu thị hàm không cung cấp kết quả để bên gọi sử dụng. int biểu thị hàm trả về số nguyên; các đường thực thi kết thúc bình thường phải trả về giá trị int.')
add('dart-arrow', 'Hàm mũi tên trong Dart dùng khi nào?', 'Dùng cho thân hàm chỉ có một biểu thức. Ví dụ int square(int n) => n * n; tương đương int square(int n) { return n * n; }. Không đặt một khối nhiều câu lệnh sau =>.')
add('dart-named', 'Dart: tham số đặt tên có bắt buộc không?', 'Tham số đặt tên là tùy chọn trừ khi có required. Ví dụ void greet({required String name, int times = 1}) {} yêu cầu truyền name; times có giá trị mặc định. C++ không có cú pháp tham số đặt tên trực tiếp tương đương khi gọi hàm.')
add('dart-null', 'Trong Dart, String khác String? thế nào?', 'String là kiểu chuỗi không nhận null theo null safety. String? có thể là chuỗi hoặc null. Cần kiểm tra null hoặc dùng toán tử xử lý null thích hợp trước khi sử dụng như một String.')
add('dart-function-purpose', 'Tại sao nên tách chương trình thành hàm?', 'Hàm gom một nhiệm vụ có tên, giúp tái sử dụng, kiểm tra riêng và giảm lặp mã. Đầu vào truyền qua tham số, kết quả trả qua return. Không cần tách mọi dòng thành một hàm nếu làm mã khó đọc hơn.')
add('network-dns', 'DNS làm nhiệm vụ gì?', 'DNS lưu và phân giải các bản ghi gắn với tên miền. Ví dụ bản ghi A ánh xạ tên sang địa chỉ IPv4, AAAA sang IPv6; DNS còn có nhiều loại bản ghi khác, không chỉ địa chỉ IP.')
add('network-port', 'Địa chỉ IP và port khác nhau thế nào?', 'IP định danh địa chỉ mạng của thiết bị hoặc giao diện. Port giúp phân biệt các đầu cuối dịch vụ TCP hoặc UDP trên cùng địa chỉ. Một kết nối TCP được xác định bởi địa chỉ và port ở hai phía.')
add('network-http', 'HTTP 401 và HTTP 403 khác nhau thế nào?', '401 cho biết yêu cầu thiếu thông tin xác thực hợp lệ. 403 cho biết máy chủ hiểu yêu cầu nhưng từ chối thực hiện; thường do không đủ quyền. Đăng nhập lại không nhất thiết giải quyết được 403.')
add('db-primary', 'Khóa chính trong cơ sở dữ liệu quan hệ dùng làm gì?', 'Khóa chính định danh duy nhất mỗi hàng và không nhận NULL. Có thể gồm một cột hoặc nhiều cột. Một bảng chỉ có một ràng buộc khóa chính, nhưng ràng buộc đó có thể là khóa ghép.')
add('db-foreign', 'Khóa ngoại có bắt buộc phải duy nhất không?', 'Không. Nhiều hàng có thể cùng tham chiếu một hàng ở bảng được tham chiếu. Tính duy nhất của khóa ngoại chỉ có nếu được áp thêm ràng buộc như UNIQUE.')
add('db-delete', 'DELETE không có WHERE có tác dụng gì?', 'DELETE FROM ten_bang; yêu cầu xóa tất cả hàng trong bảng, nhưng giữ định nghĩa bảng. Với dữ liệu thật cần kiểm tra điều kiện và quyền thao tác trước khi thực hiện.')
add('os-process-thread', 'Tiến trình và luồng khác nhau thế nào?', 'Tiến trình thường có không gian địa chỉ riêng. Các luồng trong một tiến trình chia sẻ không gian địa chỉ và nhiều tài nguyên, nhưng mỗi luồng có stack và trạng thái thực thi riêng. Chia sẻ dữ liệu cần đồng bộ để tránh tranh chấp.')
add('ai-rag-training', 'Thêm tài liệu vào RAG có phải huấn luyện lại mô hình không?', 'Không. RAG truy xuất nội dung để bổ sung ngữ cảnh lúc trả lời. Thêm tài liệu hoặc cập nhật chỉ mục không tự cập nhật trọng số mô hình. Fine-tuning cần một quá trình tối ưu trọng số riêng.')
add('ai-offline-honesty', 'Mô hình chưa chạy nhưng đã thêm dữ liệu hỏi đáp, có thể nói đã huấn luyện xong không?', 'Không. Chỉ có thể nói đã chuẩn bị hoặc bổ sung dữ liệu. Chỉ xác nhận huấn luyện khi quá trình cập nhật trọng số thực sự chạy và có kết quả được kiểm tra.')
add('debug-missing-context', 'Code của tôi bị lỗi, sửa ngay đi.', 'Bạn gửi đoạn code liên quan, thông báo lỗi đầy đủ, đầu vào và kết quả mong muốn nhé. Hiện chưa đủ thông tin để xác định lỗi cụ thể.')
add('validation-python-gcd', 'Viết Python tìm ước chung lớn nhất của hai số nguyên bằng Euclid.',
'''def gcd(a, b):
    a, b = abs(a), abs(b)
    while b:
        a, b = b, a % b
    return a''', split='validation', language='python', checks='assert gcd(48,18) == 6\nassert gcd(-12,8) == 4\nassert gcd(0,5) == 5\nassert gcd(0,0) == 0')
add('validation-db-index', 'Thêm index cho mọi cột có luôn tốt không?', 'Không. Index tăng chi phí lưu trữ và cập nhật dữ liệu. Nên chọn index theo truy vấn, độ chọn lọc và kế hoạch thực thi; đo trước và sau thay đổi.', split='validation')
add('validation-network-udp', 'UDP có đảm bảo gói tin đến đủ và đúng thứ tự không?', 'Không. UDP không tự bảo đảm giao nhận, thứ tự hay truyền lại. Ứng dụng phía trên có thể tự bổ sung các cơ chế đó.', split='validation')
add('test-python-palindrome', 'Viết Python kiểm tra chuỗi đối xứng, so sánh nguyên văn ký tự.',
'''def is_palindrome(text):
    return text == text[::-1]''', split='test', language='python', checks="assert is_palindrome('abba')\nassert is_palindrome('')\nassert not is_palindrome('Abba')\nassert not is_palindrome('abc')")
add('test-js-equality', 'JavaScript: == và === khác nhau thế nào?', '=== so sánh nghiêm ngặt, không ép hai toán hạng khác kiểu về cùng kiểu. == có thể chuyển kiểu theo quy tắc của JavaScript. Ví dụ 0 == false là true, còn 0 === false là false.', split='test')
add('test-ai-evaluation', 'Có nên dùng chính bộ train để công bố độ chính xác tổng quát của chatbot không?', 'Không. Kết quả trên train không chứng minh khả năng tổng quát. Cần tập đánh giá riêng không đưa vào huấn luyện và tiêu chí chấm phù hợp; dữ liệu gần trùng cũng có thể làm sai lệch đánh giá.', split='test')

def main():
    out = Path('training/exports/kikial-additional-v2')
    if out.exists():
        raise SystemExit(f'{out} đã tồn tại; không ghi đè. Đổi tên hoặc sao lưu trước.')
    node = shutil.which('node')
    if not node:
        raise SystemExit('Cần Node.js để kiểm tra các ví dụ JavaScript trước khi xuất.')
    seen = set()
    examples = []
    code_tests = 0
    for i, row in enumerate(ROWS, 1):
        key = row['question'].strip().casefold()
        if key in seen:
            raise ValueError('Câu hỏi trùng')
        seen.add(key)
        if row['language'] == 'python':
            result = subprocess.run(['python3', '-I', '-c', row['answer'] + '\n' + row['checks']], capture_output=True, text=True, timeout=5)
        elif row['language'] == 'javascript':
            result = subprocess.run([node, '--input-type=module', '-e', "import assert from 'node:assert/strict';\n" + row['answer'] + '\n' + row['checks']], capture_output=True, text=True, timeout=5)
        else:
            result = None
        if result is not None:
            if result.returncode:
                raise RuntimeError(row['topic'] + ': ' + result.stderr)
            code_tests += 1
        answer = row['answer']
        if row['language']:
            answer = f"```{row['language']}\n{answer}\n```"
        examples.append({'id': f'additional-v2-{i:03d}', 'type': 'SFT',
            'instruction': row['question'], 'input': '', 'output': answer,
            'source': 'ASSISTANT_AUTHORED', 'language': 'vi', 'domain': row['topic'],
            'difficulty': 'EASY', 'qualityScore': 0.8, 'verified': bool(result is not None),
            'privacySafe': True, 'datasetVersion': 'kikial-additional-v2', 'split': row['split'],
            'reviewStatus': 'code-tested' if result is not None else 'conceptual-review-required'})
    out.mkdir(parents=True)
    def write_jsonl(name, rows):
        (out/name).write_text(''.join(json.dumps(r, ensure_ascii=False)+'\n' for r in rows), encoding='utf-8')
    write_jsonl('candidates.jsonl', examples)
    # Reviewed candidates stay separate; only executed code examples enter SFT files.
    for split in ['train', 'validation', 'test']:
        write_jsonl(split+'.jsonl', [{'messages':[{'role':'user','content':e['instruction']},
                      {'role':'assistant','content':e['output']}]} for e in examples
                      if e['split'] == split and e['verified']])
    manifest = {'version':'kikial-additional-v2', 'newCandidates':len(examples),
        'executedCodeExamples':code_tests, 'conceptualReviewRequired':len(examples)-code_tests,
        'candidateSplits':{s:sum(e['split']==s for e in examples) for s in ['train','validation','test']},
        'exportedSplits':{s:sum(e['split']==s and e['verified'] for e in examples) for s in ['train','validation','test']},
        'trained':False, 'modelWeightsChanged':False,
        'notes':['Not merged into previous 12 examples.', 'No human review or model benchmark claimed.',
                 'Validation/test examples must not be merged into the training split.',
                 'Passing these snippet checks does not prove general chatbot accuracy.'],
        'sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(out.glob('*.jsonl'))}}
    (out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(manifest,ensure_ascii=False,indent=2))

if __name__ == '__main__':
    main()