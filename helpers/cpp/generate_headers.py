import re

def extract_function_signatures(file_content):
    function_pattern = re.compile(r"\b(\w+\s+\w+\([^)]*\))\s*{")
    return function_pattern.findall(file_content)

def generate_header(functions):
    header_guard = "GENERATED_HEADER_H"
    header_content = f"#ifndef {header_guard}\n#define {header_guard}\n\n"
    for func in functions:
        header_content += func + ";\n"
    header_content += "\n#endif // " + header_guard + "\n"
    return header_content

cpp_filename = "helpers.cpp"
header_filename = "helpers.h"

with open(cpp_filename, "r") as cpp_file:
    cpp_content = cpp_file.read()

signatures = extract_function_signatures(cpp_content)
header_content = generate_header(signatures)

with open(header_filename, "w") as header_file:
    header_file.write(header_content)

print(f"Header file '{header_filename}' generated successfully.")
